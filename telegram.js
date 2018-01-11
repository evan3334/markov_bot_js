var promise = require('promise');
process.env.NTBA_FIX_319=true;
var TelegramBot = require('node-telegram-bot-api');
TelegramBot.Promise = promise;
var cliJS = require('./cli.js');

module.exports = function telegram(cliInstance) {
  var cli;
  if(!cliInstance || !(cliInstance instanceof cliJS))
  {
    throw new Error('cliInstance must be a valid instance of cli.js');
  }
  else
  {
    cli = cliInstance;
  }

  var bot = {};
  var initialized = false;
  var me = {};

  var commands = [];

  this.initTelegram = function initTelegram(token, options) {
    return new promise(function(fulfill, reject) {
      if (options === null || typeof options !== 'object') {
        options = {};
      }
      bot = new TelegramBot(token, options);
      bot.getMe()
        .then(function (info) {
          me = info;
          initialized = true;

          bot.on('message',processCommands);

          bot.startPolling();

          fulfill();
        })
        .catch(function (err) {
          cli.err('An error occurred while checking token. Token could be invalid.');
          cli.err(err.stack);
          initialized = false;
          reject(err);
        })
    });
  };

  this.getBotInformation = function getBotInformation() {
    if (!initialized) {
      return null;
    }
    else {
      return me;
    }
  };

  this.on = function(event, handler){
    return bot.on(event, handler);
  };

  this.addCommandListener = function(command, listener){
    if(command && typeof command === 'string')
    {
      if(listener && typeof listener === "function")
      {
        commands.push({command:command.toLowerCase(),listener:listener});
      }
      else
      {
        throw new Error("listener must be a valid function with params (message, args, bot)");
      }
    }
    else
    {
      throw new Error("command must be a valid string");
    }
  };

  this.removeCommandListener = function(command)
  {
    command = command.toLowerCase();
    for(var i=0;i<commands.length;i++)
    {
      var current = commands[i];
      if(current.command === command)
      {
        commands.splice(i,1);
        return true;
      }
    }
    return false;
  };

  function processCommands(input) {
    for (var i = 0; i < commands.length; i++) {
      var currentCommand = commands[i];
      var pattern = "\\/(?:" + currentCommand.command + ")|(?:(" + currentCommand.command + ")@)";
      var regex = new RegExp(pattern);
      if (regex.test(input)) {
        if (currentCommand.listener && typeof currentCommand.listener === "function")
        {
          var args = input.split(' ');
          args.splice(0,1);
          currentCommand.listener(input, args, bot);
        }
      }
    }
  }
};