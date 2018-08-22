let cliJS = require('./cli.js');
let telegram = require('./telegram.js');
let Markov = require('./markov.js');
let Chain = Markov.Chain;

const debug = false;

let cli = new cliJS(debug);
cli.setupInterface();

let markov = new Markov(cli);

let token = process.argv[2];
if (token === null || token === '') {
  cli.err("No token was provided!");
  cli.err("Usage: node main.js <telegram token>");
  cli.exit(1);
}

let tg = new telegram(cli);
tg.addCommandListener("start", function (message, args,bot ){
  cli.log("/start command executed by "+cli.getUserFormat(message.from)+" in "+cli.getChatFormat(message.chat));
  let welcomeMsg = "Hi, I'm the Markov Chain bot!\n" +
    "I can create messages based on Markov Chains, generated from the chat messages in this group." +
    "Basically, I read the messages in this group and when you run my `/markov` command, I'll use words in your messages that are more likely to follow each other and make a message out of it.\n"+
    "(More on how that works [here](http://setosa.io/ev/markov-chains/).)\n\n" +
    "My developer is @evan3334, and my code is open source and can be viewed [here](https://github.com/evan3334/markov_bot_js)." +
    "You may want to visit @evanbotnews to see what's going on with my development or operating status.";
  bot.sendMessage(message.chat.id, welcomeMsg, {parse_mode: "Markdown"});
});
tg.addCommandListener("markov", function (message, args, bot) {
  cli.log("/markov command executed by "+cli.getUserFormat(message.from)+" in "+cli.getChatFormat(message.chat));
  let msg;
  markov.getChainForChat(message.chat.id)
    .then(function (chain) {
      msg = chain.generateMessage(100);
      cli.debug(msg);
      bot.sendMessage(message.chat.id, msg);//, {parse_mode: "Markdown"});
    })
    .catch(function (err) {
      cli.err(err.stack);
    });
});
tg.addCommandListener("markovclear", function (message, args, bot) {
  cli.log("/markovclear command executed by "+cli.getUserFormat(message.from)+" in "+cli.getChatFormat(message.chat));
  tg.isAdmin(message.from.id,message.chat)
    .then(function(isAdmin){
      if (isAdmin) {
        let newchain = new Chain();
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

    cli.setOnExit(async function(){
      await markov._getStorage().saveAll();
    });

    process.on('SIGINT',async ()=>{
      cli.exit(0);
    });

    process.on('SIGTERM', async()=>{
      cli.exit(0);
    });

    tg.on('message', function (message,bot) {
      if (message.text) {
        cli.log("Message from " + cli.getUserFormat(message.from) + " in " + cli.getChatFormat(message.chat) + ": " + message.text);
        markov.getChainForChat(message.chat.id)
          .then(function (chain) {
            chain.addMessage(message.text);
            markov.saveChainForChat(message.chat.id, chain)
              .catch(function (err) {
                cli.err("An error occurred saving chain for " + message.chat.id);
                cli.err(err.stack);
              });
          })
          .catch(function (err) {
            cli.err(err.stack);
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