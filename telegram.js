var promise = require('promise');
process.env.NTBA_FIX_319 = true;
var TelegramBot = require('node-telegram-bot-api');
TelegramBot.Promise = promise;
var cliJS = require('./cli.js');

module.exports = function telegram(cliInstance) {
  var cli;
  if (!cliInstance || !(cliInstance instanceof cliJS)) {
    throw new Error('cliInstance must be a valid instance of cli.js');
  }
  else {
    cli = cliInstance;
  }

  var bot = {};
  var initialized = false;
  var me = {};
  var messageEvents = [];

  var commands = [];

  this.initTelegram = function initTelegram(token, options) {
    return new promise(function (fulfill, reject) {
      if (options === null || typeof options !== 'object') {
        options = {};
      }
      bot = new TelegramBot(token, options);
      bot.getMe()
        .then(function (info) {
          me = info;
          initialized = true;

          bot.on('message', onMessage);

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

  this.on = function (event, handler) {
    if (event === "message") {
      messageEvents.push(handler);
    }
    else {
      return bot.on(event, handler);
    }
  };

  this.isAdmin = function isAdmin(user_id, chat) {
    return new Promise(function (fulfill, reject) {
      if(chat.type==="private"){
        fulfill(chat.id===user_id);
      }
      bot.getChatAdministrators(chat.id)
        .then(function (admins) {
          var found = false;
          for (var i in admins) {
            var current = admins[i];
            if (current.user.id === user_id) {
              found = true;
              break;
            }
          }
          fulfill(found);
        }).catch(reject);
    });
  };

  this.addCommandListener = function (command, listener) {
    if (command && typeof command === 'string') {
      if (listener && typeof listener === "function") {
        commands.push({command: command.toLowerCase(), listener: listener});
      }
      else {
        throw new Error("listener must be a valid function with params (message, args, bot)");
      }
    }
    else {
      throw new Error("command must be a valid string");
    }
  };

  function onMessage(msg) {
    if (!processCommands(msg)) {
      for (var i in messageEvents) {
        var event = messageEvents[i];
        event(msg);
      }
    }
  }

  this.removeCommandListener = function (command) {
    command = command.toLowerCase();
    for (var i = 0; i < commands.length; i++) {
      var current = commands[i];
      if (current.command === command) {
        commands.splice(i, 1);
        return true;
      }
    }
    return false;
  };

  function processCommands(input) {
    var messageText = input.text;
    var namePattern = "\\/.*@([a-z,A-Z,\\S]*)";
    var nameRegex = new RegExp(namePattern);
    if (nameRegex.test(messageText)) {
      //this is a command with a bot name on it
      var results = nameRegex.exec(messageText);
      if (!(results[1] && me.username && results[1].toLowerCase() === me.username.toLowerCase())) {
        //it's not our name. return true so that nothing else processes this message.
        return true;
      }
    }
    for (var i = 0; i < commands.length; i++) {
      var currentCommand = commands[i];
      var firstPart = messageText.split(" ")[0].split("@")[0];
      if (firstPart==="/"+currentCommand.command) {
        if (currentCommand.listener && typeof currentCommand.listener === "function") {
          var args = messageText.split(' ');
          args.splice(0, 1);
          currentCommand.listener(input, args, bot);
          return true;
        }
      }
    }
    return false;
  }
};