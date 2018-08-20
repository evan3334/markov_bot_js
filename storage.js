let fs = require('fs');
let Promise = require('promise');
let cliJS = require('./cli.js');

/**
 * Forces garbage collection
 */
function performGC() {
  if (global.gc) {
    global.gc();
  }
}

const MAX_CHATS_IN_CACHE = 10;

module.exports = function storage(cliInstance) {
  let cli;
  if (!cliInstance || !(cliInstance instanceof cliJS)) {
    throw new Error('cliInstance must be a valid instance of cli.js');
  }
  else {
    cli = cliInstance;
  }

  //cache for holding chats so we aren't constantly writing to disk
  let cache = [];

  let currentDirectory = process.cwd();
  let chatFilePrefix = "chat_";
  let dataDirectory = currentDirectory + "/markov2/";

  //TODO make async instead of explicitly returning Promise
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
            fs.readdir(dataDirectory, null, function (err, files) {
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

  //TODO make async instead of explicitly returning Promise
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
        else if (err.code === "EEXIST") {
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

  //TODO make async instead of explicitly returning Promise
  function checkChatFilePerms(chat_id) {
    if (chat_id) {
      return new Promise(function (fulfill, reject) {
        fs.access(dataDirectory + chatFilePrefix + chat_id + ".json",
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

  //TODO make async instead of explicitly returning Promise
  function createChatFile(chat_id) {
    return new Promise(function (fulfill, reject) {
      let path = dataDirectory + chatFilePrefix + chat_id + ".json";
      createDataDirectory().then(function () {
        checkChatFilePerms(chat_id).then(fulfill).catch(function (err) {
          if (err.code === "ENOENT") {
            fs.writeFile(path, JSON.stringify({words: []}, null, 2), 'utf8', function (err) {
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


  this.readChat = async function readChat(chat_id) {
    //check if the chat is in the cache
    let index = await findChatIndex(chat_id);
    if (index == null) {
      //chat is not in the cache, let's load it
      //we can just return the loaded chat, it's already in the cache
      return await loadChat(chat_id).data;
    }
    else {
      //chat is already in the cache, let's pull it out and return it
      return cache[index].data;
    }
  };


  this.saveChat = async function saveChat(chat_id, data) {
    let index = await findChatIndex(chat_id);
    let chatObj = {
      id: chat_id,
      data: data
    };
    if (index != null) {
      cache[index] = chatObj;
    }
    else {
      cache.push(chatObj);
    }
    cleanCache().catch((e) => {
      cli.err("Something went wrong cleaning the cache.");
      cli.err(e.stack)
    })
  };

  async function findChatIndex(chat_id) {
    for (let i = 0; i < cache.length; i++) {
      let chat = cache[i];
      if (chat.id === chat_id) {
        return i;
      }
    }
    return null;
  }


  async function writeChatFile(chat_id, contents) {
    let path = dataDirectory + chatFilePrefix+ chat_id + ".json";
    cli.debug("Saving to "+path);
    await createChatFile(chat_id);
    try {
      fs.writeFileSync(path, JSON.stringify(contents, null, 2), 'utf8');
    }
    catch (e) {
      cli.err("Something went wrong saving file for chat " + chat_id);
      cli.err(e.stack);
      cli.exit(1);
    }
  }

  async function readChatFile(chat_id) {
    let path = dataDirectory + chatFilePrefix + chat_id + ".json";
    await createChatFile(chat_id);
    try {
      let fileContents = fs.readFileSync(path, 'utf8');
      return JSON.parse(fileContents);
    }
    catch (e) {
      cli.err("Something went wrong parsing JSON for chat " + chat_id);
      cli.err(e.stack);
      cli.exit(1);
    }
  }

  async function cleanCache() {
    //check if the cache is too full
    while (cache.length > MAX_CHATS_IN_CACHE) {
      //unload the first item in the cache (items are First In, Last Out, so the first item is the least recently loaded)
      await unloadChat(cache[0].id);
    }
  }

  async function unloadChat(chat_id) {
    cli.debug("Unloading chat " + chat_id);
    //check if it's in the cache first
    let index = await findChatIndex(chat_id);
    if (index != null) {
      try {
        //save the chat to disk
        await writeChatFile(cache[index].id, cache[index].data);
        //remove the chat from the cache
        cache.splice(index, 1);
      } catch (e) {
        cli.err("Something went wrong saving file for chat " + chat_id);
        cli.err(e.stack);
      }
    }
  }

  async function loadChat(chat_id) {
    cli.debug("Loading chat " + chat_id);
    //check if chat is already in cache
    let index = await findChatIndex(chat_id);
    if (index != null) {
      //if chat is already in cache, remove it; when loading, disk contents take priority
      cache.splice(index, 1);
    }
    //load chat from disk
    let data = await readChatFile(chat_id);
    //save chat to cache
    let chatObj = {
      id: chat_id,
      data: data
    };
    cache.push(chatObj);
    //start cleaning up the cache
    cleanCache().catch((e) => {
      cli.err("Something went wrong cleaning the cache");
      cli.err(e.stack);
    });
    //return the chat as well
    return chatObj;
  }

  this.saveAll = async function saveAll() {
    cli.log("Saving all chats...");
    cli.debug("Cache contents:");
    cli.debug(cache);
    let total = cache.length;
    for (let i = 0; i < total; i++) {
      let chat = cache[i];
      cli.log("Saving chat " + chat.id + " (" + (i + 1) + " of " + total + ")");
      await unloadChat(chat.id);
    }
    cli.log("Saved all chats");
  }

}
;