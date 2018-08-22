let readline = require('readline');
let util = require('util');

//require the colors library, to make colored text in the console
let colors = require('colors');

module.exports = function cli(showDebug) {
  //letiable to hold the last time a message was sent.
  //used to determine whether the full date should be sent - if only the time is different and not the day then we won't waste space
  let lastTime = new Date(0);

  let firstTime = true;

  let exitFunc;

  this.setupInterface = function (readlineInstance) {
    let rl;
    if (readlineInstance && readlineInstance instanceof readline.Interface) {
      rl = readlineInstance;
    }
    else {
      rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
    }
    rl.setPrompt("> ", 2);
    rl.on('close', function () {
      return process.exit(1);
    });
    rl.on("SIGINT", function () {
      //this function does not exist if the program isn't running in a TTY
      if (process.isTTY) {
        rl.clearLine();
      }
      rl.question("Confirm exit : ", function (answer) {
        return (answer.match(/^o(ui)?$/i) || answer.match(/^y(es)?$/i)) ? process.exit(1) : rl.output.write("> ");
      });
    });
    rl.prompt();
    //make sure we don't do this stuff unless this program is running in a TTY, if it's not running in TTY
    // then that causes some serious issues (no escape sequences work and some functions do not exist)
    if (process.isTTY) {
      let fu = function (type, args) {
        let t = Math.ceil((rl.line.length + 3) / process.stdout.columns);
        let text = util.format.apply(console, args);
        rl.output.write("\n\x1B[" + t + "A\x1B[0J");
        rl.output.write(text + "\n");
        rl.output.write(new Array(t).join("\n\x1B[E"));
        rl._refreshLine();
      };
      rl.on('line', function () {
        rl.prompt();
      });

      console.log = function () {
        fu("log", arguments);
      };
      console.warn = function () {
        fu("warn", arguments);
      };
      console.info = function () {
        fu("info", arguments);
      };
      console.error = function () {
        fu("error", arguments);
      };
    }
    return rl;
  };

  this.setOnExit = function setOnExit(exitFunction){
    if(typeof exitFunction === "function"){
      exitFunc = exitFunction;
    }
  };

  this.setupCommandListener = function (rl, listener, deleteOld) {
    if (firstTime) {
      firstTime = false;
      deleteOld = true;
    }
    if (deleteOld) {
      rl.removeAllListeners('line');
    }
    if (typeof listener === 'function') {
      rl.on("line", function (line) {
        listener(line);
        rl.prompt();
      });
    }
  };

  //returns a formatted string for user information.
  //the returned string will be in the format "Full Name (@username) [ID: XXXXXXXXX]"
  this.getUserFormat = function (user) {
    return this.getFormattedName(user).bold.green + " (".yellow + this.getUsername(user) + ")".yellow + " [ID: ".bold.cyan + user.id.toString().inverse + "]".bold.cyan;
  };

  //returns the formatted full name of a user.
  //if the user has no last name set, then "Firstname" will be returned,
  //but if the user does have a last name set, then "Firstname Lastname" will be returned.
  this.getFormattedName = function (user) {
    if (user.first_name !== null && typeof user.first_name === 'string') {
      return user.first_name + (user.last_name ? " " + user.last_name : "");
    }
    else {
      return "";
    }
  };

  //returns the formatted username of a user.
  //if the user has a username, then "@username" will be returned, but if
  //the user does not have a username, then "No username" will be returned.
  this.getUsername = function (user) {
    return (user.username ? "@" + user.username.bold.magenta : "No username".italic.magenta);
  };

  this.getChatFormat = function(chat)
  {
    let output = "";
    if(chat.type)
    {
      switch(chat.type)
      {
        case 'private':
          output+="PM".yellow+" ";
          break;
        case 'group':
          output+=chat.title.bold.green+" (G)".yellow+" ";
          break;
        case 'supergroup':
          output+=chat.title.bold.green+" (SG)".yellow+" ";
          break;
        case 'channel':
          output+=chat.title.bold.green+" (CH)".yellow+" ";
          break;
      }
    }
    if(chat.id)
    {
      output += "[ID: ".bold.cyan+ chat.id.toString().inverse + "]".bold.cyan;
    }
    return output;
  };

  //object holding some preset logging levels and their formatted prefixes
  this.levels = {
    debug: "DEBUG".bold.gray,
    info: "INFO".bold.green,
    warn: "WARN".bold.yellow,
    err: "ERROR".bold.red
  };

  //function to output log messages to the console
  this.log = function (msg, level) {
    if(level === this.levels.debug && !showDebug){
      return;
    }

    //if no level is provided
    if ((level === null) || (level === undefined) || (level.trim() === "")) {
      //level is automatically INFO
      level = this.levels.info;
    }
    //letiable to hold the current time
    let currentTime = time();
    //output the message, formatting the time string based on last time and current time
    if(level === this.levels.err)
    {
      console.error("[" + timefmt(currentTime, lastTime) + "][" + level + "] " + msg);
    }
    else if(level === this.levels.warn)
    {
      console.warn("[" + timefmt(currentTime, lastTime) + "][" + level + "] " + msg);
    }
    else
    {
      console.log("[" + timefmt(currentTime, lastTime) + "][" + level + "] " + msg);
    }
    //assign the current time to the last time; it will be compared the next time a log message is sent
    lastTime = currentTime;
  };

  this.debug = function(msg){
    this.log(msg, this.levels.debug);
  };

  this.err = function(msg)
  {
    this.log(msg, this.levels.err);
  };

  this.warn = function(msg)
  {
    this.log(msg, this.levels.warn);
  };

  //function to exit and display a log message based on the status code
  this.exit = function (code) {
    //letiable to hold the log level
    let level = "";
    //if the exit status code is greater than zero (error occurred)
    if (code > 0) {
      //set the log level to "ERROR"
      level = this.levels.err;
    }
    //otherwise
    else {
      //set the log level to "INFO"
      level = this.levels.info;
    }
    this.log("Preparing to exit... (Code: "+code+")", level);

    if(exitFunc !== null){
      let ret = exitFunc();
      if(ret instanceof Promise){
        ret.then(() => {
          //output the log message, including the status code
          this.log("Exiting... (Code: " + code + ")", level);
          //actually exit the program, returning the status code
          process.exit(code);
        });
      }
      else{
        //output the log message, including the status code
        this.log("Exiting... (Code: " + code + ")", level);
        //actually exit the program, returning the status code
        process.exit(code);
      }
    }
  };
};

//gets the current time as a Date object.
function time() {
  return new Date();
}

//checks whether the date portions of two Date objects are different or not.
function checkDateDiff(time1, time2) {
  return (
    //check year
    (time1.getFullYear() !== time2.getFullYear()) ||
    //check month
    (time1.getMonth() !== time2.getMonth()) ||
    //check day
    (time1.getDate() !== time2.getDate())
  );
}

//returns a formatted time string. Decides whether to include the date based on whether the dates of "now" and "last" are different.
function timefmt(now, last) {
  //letiable to hold the current time, formatted as YYYY-MM-DDTHH:MM:SS.mmmZ
  let nowstr = now.toJSON();
  //letiable to hold the output string, now empty
  let outstr = "";
  //letiable to hold the current date as a string. uses regular expression to match everything before the "T"
  let datestr = nowstr.match(/([0-9,-]+)T/)[1].cyan;
  //letiable to hold the current time as a string. uses regular expression to match everything between the "T" and the "Z"
  let timestr = nowstr.match(/T([0-9,\:,\.]+)Z/)[1].bold.blue;
  //checks if the dates are different
  if (last && checkDateDiff(last, now)) {
    //assign the date string and a space to the output
    outstr = datestr + " ";
  }
  //append the time string to the output
  outstr = outstr + timestr;
  //return the output
  return outstr;
}