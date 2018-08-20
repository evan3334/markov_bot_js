let Storage = require('./storage.js');
let Promise = require('promise');
let cliJS = require('./cli.js');

//maximum length for a word, we don't want someone to mess us up by giving us a million-letter word or something
const MAX_WORD_LENGTH = 50;
//helps make sure we don't get any weird stuff in our database like RTL characters; only letters, punctuation, and numbers are allowed
const ALLOWABLE_UNICODE_CATEGORIES = ["Ll", "Lm", "Lo", "Lt", "Lu", "Nd", "Nl", "No", "Pc", "Pd", "Pe", "Pf", "Pi", "Po", "Ps"];

//will be filled with Unicode category databases
let categories = {};

//get the category databases created by the unicode module
for (let i = 0; i < ALLOWABLE_UNICODE_CATEGORIES.length; i++) {
  let category = ALLOWABLE_UNICODE_CATEGORIES[i];
  categories[category] = require('unicode/category/' + category);
}

module.exports = function Markov(cliInstance) {

  var cli;
  if (!cliInstance || !(cliInstance instanceof cliJS)) {
    throw new Error('cliInstance must be a valid instance of cli.js');
  }
  else {
    cli = cliInstance;
  }

  //create a storage module instance for our use
  let storage = new Storage(cli);

  this._getStorage = function _getStorage(){
    return storage;
  };

  //TODO make async instead of explicitly returning Promise
  //will look up, load, and then return a Chain given a chat_id.
  this.getChainForChat = function getChainForChat(chat_id) {
    return new Promise(function (fulfill, reject) {
      //read the chat file for the ID
      storage.readChat(chat_id).then(function (contents) {
        //create a chain based on the contents
        let c = new module.exports.Chain(contents);
        //return said chain. if the contents were invalid at all, c will simply be a blank chain.
        fulfill(c);
      }).catch(reject); //if any error is encountered, reject the promise that this function returns
    });
  };

  //TODO make async instead of explicitly returning Promise
  //writes a chain for a chat to a file given the chat id and chain
  this.saveChainForChat = function saveChainForChat(chat_id, chain) {
    return new Promise(function (fulfill, reject) {
      //write the chain object to a file
      storage.saveChat(chat_id, chain.getChain()).then(fulfill).catch(reject);
    })
  }
};

module.exports.Chain = function Chain(object) {
  let chain = {};

  chain.words = [];
  chain.probabilities = {};

  //if some pre-existing object was given, let's make a chain object based on that object.
  validateObject(object);

  //otherwise, let's just make a blank one.

  this.getChain = function getChain() {
    return chain;
  };

  this.addWord = function addWord(word) {
    if (word && typeof word === 'string') {
      if (!chain.words.includes(word) && !chain.probabilities[word]) {
        chain.words.push(word);
        chain.probabilities[word] = {};
      }
    }
  };

  function allowable(char) {
    //make sure what we've got is only one character; this just uses the first letter of whatever was passed
    char = char.substring(0, 1);
    //get the character code, stuff is stored in the unicode databases based on character code
    code = char.charCodeAt(0);
    //check through all the allowable unicode categories
    for (let i = 0; i < ALLOWABLE_UNICODE_CATEGORIES.length; i++) {
      //if the character code is in the current category, return true. the character's allowable.
      if (categories[ALLOWABLE_UNICODE_CATEGORIES[i]][code]) {
        return true;
      }
    }
    //if, after all this, we've reached this point, no category contained the character code. this character is not allowable.
    return false;
  }

  function cleanWord(word) {
    let chars = word.split('');
    let output = '';
    for (let i = 0; i < chars.length; i++) {
      if (allowable(chars[i])) {
        output += chars[i];
      }
    }
    return output;
  }

  this.addMessage = function addMessage(message) {
    if (message && typeof message === 'string') {
      let words = message.split(" ");
      for (let i = 0; i < words.length; i++) {
        let word = words[i];
        word = word.substring(0, MAX_WORD_LENGTH);
        word = cleanWord(word);
        words[i] = word;
        this.addWord(word);
      }

      //we should now add an empty word ("") for the last word in the message.
      //this should be used to represent the end of the message, and allows us to introduce the possibility of a chance that the message might end after a specific word.
      words.push("");
      for (i = 0; i < words.length - 1; i++) {
        word = words[i];
        let nextword = words[i + 1];
        if (chain.probabilities[word]) {
          let nextword_prob = chain.probabilities[word][nextword];
          if (nextword_prob) {
            nextword_prob++;
          }
          else {
            nextword_prob = 1;
          }
          chain.probabilities[word][nextword] = nextword_prob;
        }
      }

    }
  };

  this.getProbability = function getProbability(firstword, nextword) {
    //make sure that nextword has actually followed firstword
    if (this.getWordsFollowing(firstword).includes(nextword)) {
      let total = getTotalProb(firstword);
      //make sure that the total usages of words after this word is non-zero (to prevent a division by zero)
      if (total !== 0) {
        //get the usages of nextword after firstword, and divide by the total usages to get the probability as a decimal
        let prob = chain.probabilities[firstword][nextword];
        //return this number
        return prob / total;
      }
      else {
        //if the total usages is zero, the probability of nextword following firstword is 0
        return 0;
      }
    }
    else {
      //if nextword has never followed firstword, the probability that it will follow is 0. return this.
      return 0;
    }
  };

  this.getWordsFollowing = function getWordsFollowing(word) {
    //make sure probabilities is set for the word, if we don't know about the word this will fail
    if (chain.probabilities[word]) {
      //return the keys of probabilities for the word, this will simply return an array of all the words following this word as strings
      return Object.keys(chain.probabilities[word]);
    }
  };

  this.getUsageCount = function getUsageCount(word, nextword) {
    //make sure that word is contained in the list and that nextword has followed word before
    if (chain.probabilities[word] && chain.probabilities[word][nextword]) {
      return chain.probabilities[word][nextword];
    }
  };

  this.getWords = function getWords() {
    //just spit out the internal chain letiable's words array
    return chain.words;
  };

  function getTotalProb(word) {
    let probs = chain.probabilities[word];
    let total = 0;
    if (probs) {
      let words = Object.keys(probs);
      for (let i = 0; i < words.length; i++) {
        total += probs[words[i]];
      }
    }
    return total;
  }

  this.isEmpty = function isEmpty() {
    //check if the words array and the probabilities object are empty
    return chain.words.length === 0 && Object.keys(chain.probabilities).length === 0;
  };


  function validateObject(object) {
    //set a letiable that we may later change to 'false' if something wrong is detected
    let valid = true;
    //make sure what we've been passed is actually an object
    if (object && typeof object === 'object') {
      //make sure it has a words property and that property is an array
      if (object.words && Array.isArray(object.words)) {
        //make sure if has a probabilities property and that property is another object
        if (object.probabilities && typeof object.probabilities === 'object') {
          //check through each of the words in the probabilities object
          let words = Object.keys(object.probabilities);
          for (let i = 0; i < words.length; i++) {
            //for each of the words, check through each of the words following it and make sure their values are numbers (usage count)
            let probs = Object.keys(object.probabilities[words[i]]);
            for (let j = 0; j < probs.length; j++) {
              //if any of these values aren't numbers, set the valid flag to false
              if (!(object.probabilities[words[i]][probs[j]] && typeof object.probabilities[words[i]][probs[j]] === 'number')) {
                valid = false;
              }
            }
          }
          //after all this, if valid is still set, everything is ok. set the object to this Chain's internal chain letiable.
          if (valid) {
            chain = object;
          }
        }
      }
    }
  }

  this.generateMessage = function generateMessage(maxlength) {
    let getProbability = this.getProbability;
    let getWordsFollowing = this.getWordsFollowing;
    let getUsageCount = this.getUsageCount;

    function randInt(a, b) {
      return Math.floor(Math.random() * b) + a;
    }

    function chooseNextWord(word) {
      //to be able to choose words based on a weighted probability we can't simply choose a random word.
      //instead, we're making a "bag"-like model, where words are placed into the "bag" multiple times depending on their usages.
      //words that are in the "bag" more times than others will have a greater chance of being picked.
      let bag = [];
      //letiable to store all the words that have followed this word
      let following = getWordsFollowing(word);
      //if no words have followed this word, return ""
      if (!following || following.length === 0) {
        return "";
      }
      //for every word that has followed this word
      for (let i = 0; i < following.length; i++) {
        //store it in a letiable
        let nextword = following[i];
        //get how many times it has been used after word
        let usages = getUsageCount(word, nextword);
        //for every one of these usages, put a copy of nextword into the "bag"
        for (let j = 0; j < usages; j++) {
          bag.push(nextword);
        }
      }
      //we're done placing words into the bag, so let's pick a random one out of the bag
      let index = randInt(0, bag.length - 1); //arrays are zero indexed, so our limits are 0 and 1 fewer than the number of items in the bag
      //this is the word we have chosen. Let's return it.
      return bag[index];
    }

    let message = '';
    let words = this.getWords();
    //if we don't have any words in the chain, don't do this generation process and instead warn the users
    if (this.isEmpty()) {
      message = "_Chain is empty! Start sending some messages!_";
      return message;
    }
    let i = 1;
    let randword = true;
    let currentword;
    while (i < maxlength) {
      if (randword) {
        currentword = words[randInt(0, words.length)];
        randword = false;
      }
      else {
        currentword = chooseNextWord(currentword);
      }
      //if an empty word has been chosen, this means that the message ends after this word.
      //since this seems to generate shorter messages, I've changed it to be a 50/50 chance that the message ends.
      if (currentword === "") {
        if (randInt(1, 10) > 5) {
          randword = true;
        }
        else {
          break;
        }
      }
      //otherwise, we should append this word to the message.
      else {
        message += currentword + " ";
      }
    }
    //we have broken out of the loop, so we've either hit the maximum message length or an end-of-message condition has been randomly chosen.
    //we should now return the finished message, albeit with extra whitespace removed.
    return message.trim();
  }

};