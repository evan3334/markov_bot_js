var fs = require('fs');
var Promise = require('promise');


module.exports = function storage() {

  var currentDirectory = process.cwd();
  var dataDirectory = currentDirectory + "/markov2/";

  function checkDataDirectory() {
    return new Promise(function (fulfill, reject) {
      //let's try accessing the directory to see if it exists and we can read/write.
      fs.access(dataDirectory,
        fs.constants.F_OK | fs.constants.R_OK | fs.constants.W_OK,
        function (err) {
          //the callback gets called regardless of whether or not there's an error, so check if the error exists before rejecting.
          if (err) {
            //permission error (or some other error)
            reject(err);
          }
          else {
            //let's make sure it's a directory
            fs.readdir(dataDirectory, null, function (err,files) {
              if (err) {
                //not a directory (or some other error)
                reject(err);
              }
              else {
                //all good!
                fulfill();
              }
            })
          }
        }
      );
    });
  }

  function createDataDirectory() {
    return new Promise(function (fulfill, reject) {
      //we only really care about catching errors on this because if it fulfills, the directory already exists and it's valid.
      // if there are errors, we need to do something.
      checkDataDirectory().then(fulfill).catch(function (err) {
        if (err.code === "ENOENT") {
          //this is what we want - the directory doesn't exist. let's create it.
          fs.mkdir(dataDirectory, function (err) {
            //the callback gets called regardless of whether or not there's an error, so check if the error exists before rejecting.
            if (err) {
              reject(err);
            }
            else {
              //no error occurred. Fulfill the promise
              fulfill();
            }
          })
        }
        else if(err.code === "EEXIST"){
          //directory already exists, we're good
          fulfill();
        }
        else {
          //something else went wrong that we didn't anticipate. reject the promise.
          reject(err);
        }
      });
    });

  }

  function checkChatFilePerms(chat_id) {
    if (chat_id) {
      return new Promise(function (fulfill, reject) {
        fs.access(dataDirectory + chat_id + ".json",
          fs.constants.F_OK | fs.constants.W_OK | fs.constants.R_OK,
          function (err) {
            if (err) {
              reject(err);
            }
            else {
              fulfill();
            }
          });
      });
    }
  }

  function createChatFile(chat_id) {
    return new Promise(function (fulfill, reject) {
      var path = dataDirectory + chat_id + ".json";
      createDataDirectory().then(function () {
        checkChatFilePerms(chat_id).then(fulfill).catch(function (err) {
          if (err.code === "ENOENT") {
            fs.writeFile(path, JSON.stringify({words:[]}, null, 2), 'utf8', function (err) {
              if (err) {
                reject(err);
              }
              else {
                fulfill();
              }
            });
          }
          else {
            reject(err);
          }
        });
      }).catch(reject);
    });
  }

  this.readChatFile = function readChatFile(chat_id) {
    return new Promise(function (fulfill, reject){
      var path = dataDirectory + chat_id + ".json";
      createChatFile(chat_id).then(function(){
        fs.readFile(path, 'utf8', function(err, fileContents){
          if (err) {
            reject(err);
          } else {
            fulfill(JSON.parse(fileContents));
          }
        })
      }).catch(reject);
    });
  };

  this.writeChatFile = function writeChatFile(chat_id, contents){
    return new Promise(function (fulfill, reject){
      var path = dataDirectory + chat_id + ".json";
      createChatFile(chat_id).then(function(){
        fs.writeFile(path, JSON.stringify(contents, null, 2),'utf8', function(err){
          if(err){
            reject(err);
          }
          else{
            fulfill();
          }
        })
      }).catch(reject);
    })
  }
};