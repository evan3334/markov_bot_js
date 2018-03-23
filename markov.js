var Storage = require('./storage.js');
var Promise = require('promise');

//maximum length for a word, we don't want someone to mess us up by giving us a million-letter word or something
const MAX_WORD_LENGTH = 50;
//helps make sure we don't get any weird stuff in our database like RTL characters; only letters, punctuation, and numbers are allowed
const ALLOWABLE_UNICODE_CATEGORIES = ["Ll", "Lm", "Lo", "Lt", "Lu", "Nd", "Nl", "No", "Pc", "Pd", "Pe", "Pf", "Pi", "Po", "Ps"];

//will be filled with Unicode category databases
var categories = {};

//get the category databases created by the unicode module
for (var i = 0; i < ALLOWABLE_UNICODE_CATEGORIES.length; i++) {
  var category = ALLOWABLE_UNICODE_CATEGORIES[i];
  categories[category] = require('unicode/category/' + category);
}

module.exports = function Markov() {
  //create a storage module instance for our use
  var storage = new Storage();

  //will look up, load, and then return a Chain given a chat_id.
  this.getChainForChat = function getChainForChat(chat_id) {
    return new Promise(function (fulfill, reject) {
      //read the chat file for the ID
      storage.readChatFile(chat_id).then(function (contents) {
        //create a chain based on the contents
        var c = new module.exports.Chain(contents);
        //return said chain. if the contents were invalid at all, c will simply be a blank chain.
        fulfill(c);
      }).catch(reject); //if any error is encountered, reject the promise that this function returns
    });
  };

  //writes a chain for a chat to a file given the chat id and chain
  this.saveChainForChat = function saveChainForChat(chat_id, chain) {
    return new Promise(function (fulfill, reject) {
      //write the chain object to a file
      storage.writeChatFile(chat_id, chain.getChain()).then(fulfill).catch(reject);
    })
  }
};

module.exports.Chain = function Chain(object) {
  var chain = {};

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
    for (var i = 0; i < ALLOWABLE_UNICODE_CATEGORIES.length; i++) {
      //if the character code is in the current category, return true. the character's allowable.
      if (categories[ALLOWABLE_UNICODE_CATEGORIES[i]][code]) {
        return true;
      }
    }
    //if, after all this, we've reached this point, no category contained the character code. this character is not allowable.
    return false;
  }

  function cleanWord(word) {
    var chars = word.split('');
    var output = '';
    for (var i = 0; i < chars.length; i++) {
      if (allowable(chars[i])) {
        output += chars[i];
      }
    }
    return output;
  }

  this.addMessage = function addMessage(message) {
    if (message && typeof message === 'string') {
      var words = message.split(" ");
      for (var i = 0; i < words.length; i++) {
        var word = words[i];
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
        var nextword = words[i + 1];
        if (chain.probabilities[word]) {
          var nextword_prob = chain.probabilities[word][nextword];
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
      var total = getTotalProb(firstword);
      //make sure that the total usages of words after this word is non-zero (to prevent a division by zero)
      if (total !== 0) {
        //get the usages of nextword after firstword, and divide by the total usages to get the probability as a decimal
        var prob = chain.probabilities[firstword][nextword];
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

  this.getUsageCount = function getUsageCount(word,nextword){
    //make sure that word is contained in the list and that nextword has followed word before
    if (chain.probabilities[word] && chain.probabilities[word][nextword]) {
      return chain.probabilities[word][nextword];
    }
  };

  this.getWords = function getWords() {
    //just spit out the internal chain variable's words array
    return chain.words;
  };

  function getTotalProb(word) {
    var probs = chain.probabilities[word];
    var total = 0;
    if (probs) {
      var words = Object.keys(probs);
      for (var i = 0; i < words.length; i++) {
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
    //set a variable that we may later change to 'false' if something wrong is detected
    var valid = true;
    //make sure what we've been passed is actually an object
    if (object && typeof object === 'object') {
      //make sure it has a words property and that property is an array
      if (object.words && Array.isArray(object.words)) {
        //make sure if has a probabilities property and that property is another object
        if (object.probabilities && typeof object.probabilities === 'object') {
          //check through each of the words in the probabilities object
          var words = Object.keys(object.probabilities);
          for (var i = 0; i < words.length; i++) {
            //for each of the words, check through each of the words following it and make sure their values are numbers (usage count)
            var probs = Object.keys(object.probabilities[words[i]]);
            for (var j = 0; j < probs.length; j++) {
              //if any of these values aren't numbers, set the valid flag to false
              if (!(object.probabilities[words[i]][probs[j]] && typeof object.probabilities[words[i]][probs[j]] === 'number')) {
                valid = false;
              }
            }
          }
          //after all this, if valid is still set, everything is ok. set the object to this Chain's internal chain variable.
          if (valid) {
            chain = object;
          }
        }
      }
    }
  }

  this.generateMessage = function generateMessage(maxlength){
    var getProbability = this.getProbability;
    var getWordsFollowing = this.getWordsFollowing;
    var getUsageCount = this.getUsageCount;

    function randInt(a,b){
      return Math.floor(Math.random()*b)+a;
    }

    function chooseNextWord(word){
      //to be able to choose words based on a weighted probability we can't simply choose a random word.
      //instead, we're making a "bag"-like model, where words are placed into the "bag" multiple times depending on their usages.
      //words that are in the "bag" more times than others will have a greater chance of being picked.
      var bag = [];
      //variable to store all the words that have followed this word
      var following = getWordsFollowing(word);
      //if no words have followed this word, return ""
      if(following.length === 0){
        return "";
      }
      //for every word that has followed this word
      for(var i = 0; i<following.length; i++){
        //store it in a variable
        var nextword = following[i];
        //get how many times it has been used after word
        var usages = getUsageCount(word,nextword);
        //for every one of these usages, put a copy of nextword into the "bag"
        for(var j = 0; j<usages; j++){
          bag.push(nextword);
        }
      }
      //we're done placing words into the bag, so let's pick a random one out of the bag
      var index = randInt(0,bag.length-1); //arrays are zero indexed, so our limits are 0 and 1 fewer than the number of items in the bag
      //this is the word we have chosen. Let's return it.
      return bag[index];
    }

    var message = '';
    var words = this.getWords();
    //if we don't have any words in the chain, don't do this generation process and instead warn the users
    if(this.isEmpty()){
      message = "[__Chain is empty!__ Start sending some messages!]";
    }
    var i = 1;
    var currentword = words[randInt(0,words.length)];
    message += currentword + " ";
    while(i<maxlength){
      currentword = chooseNextWord(currentword);
      //if an empty word has been chosen, this means that the message ends after this word.
      if(currentword===""){
        break;
      }
      //otherwise, we should append this word to the message.
      else{
        message += currentword + " ";
      }
    }
    //we have broken out of the loop, so we've either hit the maximum message length or an end-of-message condition has been randomly chosen.
    //we should now return the finished message, albeit with extra whitespace removed.
    return message.trim();
  }

};