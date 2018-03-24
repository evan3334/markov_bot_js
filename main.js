var cliJS = require('./cli.js');
var telegram = require('./telegram.js');
var Markov = require('./markov.js');
var Chain = Markov.Chain;

var cli = new cliJS();
cli.setupInterface();

var markov = new Markov();

var token = process.argv[2];
if (token === null || token === '') {
  cli.err("No token was provided!");
  cli.err("Usage: node main.js <telegram token>");
  cli.exit(1);
}

var tg = new telegram(cli);
tg.addCommandListener("markov", function (message, args, bot) {
  var msg;
  markov.getChainForChat(message.chat.id)
    .then(function (chain) {
      msg = chain.generateMessage(100);
      bot.sendMessage(message.chat.id, msg, {parse_mode: "Markdown"});
    })
    .catch(function (err) {
      cli.err(err);
    });
});
tg.addCommandListener("markovclear", function (message, args, bot) {
  tg.isAdmin(message.from.id,message.chat)
    .then(function(isAdmin){
      if (isAdmin) {
        var newchain = new Chain();
        markov.saveChainForChat(message.chat.id,newchain)
          .then(function(){
            bot.sendMessage(message.chat.id, "The chain for this chat was erased.");
          })
          .catch(cli.err);
      }
      else {
        bot.sendMessage(message.chat.id, "You have to be an administrator to use that!");
      }
    })
    .catch(cli.err);
});
tg.initTelegram(token)
  .then(function () {
    cli.log(JSON.stringify(tg.getBotInformation(), null, 2));

    tg.on('message', function (message,bot) {
      cli.log("chat id: "+message.chat.id+" from: "+message.migrate_from_chat_id+" To: "+message.migrate_to_chat_id);
      if (message.text) {
        cli.log("Message from " + cli.getUserFormat(message.from) + " in " + cli.getChatFormat(message.chat) + ": " + message.text);
        markov.getChainForChat(message.chat.id)
          .then(function (chain) {
            chain.addMessage(message.text);
            markov.saveChainForChat(message.chat.id, chain)
              .catch(function (err) {
                cli.err("An error occurred saving chain for " + message.chat.id);
                cli.err(err);
              });
          })
          .catch(function (err) {
            cli.err(err);
          });
      }
      else if(message.migrate_to_chat_id) {
        markov.getChainForChat(message.chat.id)
          .then(function(chain){
            markov.saveChainForChat(message.migrate_to_chat_id,chain)
              .then(function () {
                bot.sendMessage(message.migrate_to_chat_id,"_Supergroup migration successfully completed._",{parse_mode:"Markdown"})
              })
              .catch(cli.err);
          })
          .catch(cli.err);
      }
    });
  })
  .catch(function (err) {
    cli.exit(2);
  });