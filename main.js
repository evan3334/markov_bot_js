var cliJS = require('./cli.js');
var telegram = require('./telegram.js');

var cli = new cliJS();
cli.setupInterface();

var token = process.argv[2];
if(token === null || token === '')
{
  cli.err("No token was provided!");
  cli.err("Usage: node main.js <telegram token>");
  cli.exit(1);
}

var tg = new telegram(cli);
tg.initTelegram(token)
  .then(function(){
    cli.log(JSON.stringify(tg.getBotInformation(),null,2));

    tg.on('message',function(message) {
      cli.log("Message from "+cli.getUserFormat(message.from)+" in "+cli.getChatFormat(message.chat)+": "+message.text);
    });
  })
  .catch(function(err){
    cli.exit(2);
  });