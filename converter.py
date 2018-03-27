import pickle, sys, unicodedata, json, re

ALLOWABLE = ["Lc","Ll","Lm","Lo","Lt","Lu","Nd","Nl","No"]

def clean(input):
  return "".join(filter(lambda x:(unicodedata.category(x) in ALLOWABLE),input))


if len(sys.argv) < 2:
  print("Usage: python3 converter.py <file>")
  sys.exit(1)

filename = sys.argv[1]
print("Attempting to process "+filename)
parent_path = re.compile(".*\/").search(filename)
if parent_path!=None:
  parent_path = parent_path.group(0)
else:
  parent_path = ""
chat_id = re.compile("chat_[^/]*$").search(filename).group(0)[5:-4]
newfilename = parent_path+chat_id+".json"
try:
  f = open(filename,'rb')
except OSError as err:
  if err.errno == 2: #No such file or directory
    print("The specified file does not exist! (2 - No such file or directory)")
    sys.exit(2)
  elif err.errno == 13: #Permission denied
    print("Could not access the specified file! (13 - Permission denied)")
    sys.exit(3)
  else:
    print("Something went wrong trying to access the file! More details:")
    raise(err)

o = pickle.load(f)

#Variable to store the new object
newobj = {}

#First, let's get the word list
try:
  words = o[""]
except KeyError:
  print("No words to process.")
  sys.exit(0)
#Make sure there aren't any blank strings in there
while "" in words:
  words.remove("")

newobj["words"] = words
newobj["probabilities"] = {}

#Next, let's get the list for each word, and then for each word following that word, let's add 1 usage.
#It isn't perfect, but it's the best we can do given that the old format doesn't store probability.
i = 0
for word in words:
  i+=1
  key = clean(word)
  sys.stdout.write("\rProcessing word "+str(i)+" of "+str(len(words)))
  newobj["probabilities"][word] = {}
  has_empty = False
  try:
    following = o[key]
  except KeyError:
    following = [""]
  for follow in following:
    #I've notice sometimes the old database format stores empty strings more than once. This makes sure that only one empty string is added to a word.
    if follow=="":
      if has_empty:
        continue
      else:
        has_empty = True

    newobj["probabilities"][word][follow] = 1
  #Make sure we don't miss the empty string if it wasn't in the source
  if not "" in newobj["probabilities"][word]:
    newobj["probabilities"][word][""] = 1


try:
  outfile = open(newfilename,'w')
except OSError as err:
  if err.errno == 13: #Permission denied
    print("Could not access the output file! (13 - Permission denied)")
    sys.exit(3)
  else:
    print("Something went wrong trying to access the output file! More details:")
    raise(err)

json.dump(newobj,outfile)
print("\nDone")
