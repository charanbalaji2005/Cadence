/**
 * Extra typing material. All quotes are original to Cadence. Word lists are plain,
 * lowercase English; duplicates are removed when the lists are built.
 */

const list = s => [...new Set(s.trim().split(/\s+/).map(w => w.toLowerCase()))];

/** Common English: about a thousand everyday words. */
export const ENGLISH_1K = list(`
a able about above accept across act action activity actually add address admit adult affect after again against age agency agent ago agree
agreement ahead air all allow almost alone along already also although always among amount analysis and animal another answer any anyone
anything appear apply approach area argue arm around arrive art article artist as ask assume at attack attention attorney audience author
authority available avoid away baby back bad bag ball bank bar base be beat beautiful because become bed before begin behavior behind
believe benefit best better between beyond big bill billion bit black blood blue board body book born both box boy break bring brother
budget build building business but buy by call camera campaign can cancer candidate capital car card care career carry case catch cause
cell center central century certain certainly chair challenge chance change character charge check child choice choose church citizen
city civil claim class clear clearly close coach cold collection college color come commercial common community company compare computer
concern condition conference consider consumer contain continue control cost could country couple course court cover create crime
cultural culture cup current customer cut dark data daughter day dead deal death debate decade decide decision deep defense degree
democratic describe design despite detail determine develop development die difference different difficult dinner direction director
discover discuss discussion disease do doctor dog door down draw dream drive drop drug during each early east easy eat economic economy
edge education effect effort eight either election else employee end energy enjoy enough enter entire environment environmental
especially establish even evening event ever every everybody everyone everything evidence exactly example executive exist expect
experience expert explain eye face fact factor fail fall family far fast father fear federal feel feeling few field fight figure fill film
final finally financial find fine finger finish fire firm first fish five floor fly focus follow food foot for force foreign forget form
former forward four free friend from front full fund future game garden gas general generation get girl give glass go goal good government
great green ground group grow growth guess gun guy hair half hand hang happen happy hard have he head health hear heart heat heavy help her
here herself high him himself his history hit hold home hope hospital hot hotel hour house how however huge human hundred husband idea
identify if image imagine impact important improve in include including increase indeed indicate individual industry information inside
instead institution interest interesting international interview into investment involve issue it item its itself job join just keep key
kid kill kind kitchen know knowledge land language large last late later laugh law lawyer lay lead leader learn least leave left leg legal
less let letter level lie life light like likely line list listen little live local long look lose loss lot love low machine magazine main
maintain major majority make man manage management manager many market marriage material matter may maybe me mean measure media medical
meet meeting member memory mention message method middle might military million mind minute miss mission model modern moment money month
more morning most mother mouth move movement movie much music must my myself name nation national natural nature near nearly necessary
need network never new news newspaper next nice night no none nor north not note nothing notice now number occur of off offer office
officer official often oh oil ok old on once one only onto open operation opportunity option or order organization other others our out
outside over own owner page pain painting paper parent part participant particular particularly partner party pass past patient pattern
pay peace people per perform performance perhaps period person personal phone physical pick picture piece place plan plant play player
point police policy political politics poor popular population position positive possible power practice prepare present president
pressure pretty prevent price private probably problem process produce product production professional professor program project
property protect prove provide public pull purpose push put quality question quickly quite race radio raise range rate rather reach read
ready real reality realize really reason receive recent recently recognize record red reduce reflect region relate relationship remain
remember remove report represent require research resource respond response responsibility rest result return reveal rich right rise
risk road rock role room rule run safe same save say scene school science scientist score sea season seat second section security see
seek seem sell send senior sense series serious serve service set seven several shake share she shoot short shot should shoulder show
side sign significant similar simple simply since sing single sister sit site situation six size skill skin small smile so social society
soldier some somebody someone something sometimes son song soon sort sound source south southern space speak special specific speech
spend sport spring staff stage stand standard star start state statement station stay step still stock stop store story strategy street
strong structure student study stuff style subject success successful such suddenly suffer suggest summer support sure surface system
table take talk task tax teach teacher team technology television tell ten tend term test than thank that the their them themselves then
theory there these they thing think third this those though thought thousand threat three through throughout throw thus time to today
together tonight too top total tough toward town trade traditional training travel treat treatment tree trial trip trouble true truth try
turn two type under understand unit until up upon us use usually value various very victim view violence visit voice vote wait walk wall
want war watch water way we weapon wear week weight well west western what whatever when where whether which while white who whole whom
whose why wide wife will win wind window wish with within without woman wonder word work worker world worry would write writer wrong yard
yeah year yes yet you young your yourself bright quiet river mountain forest ocean island valley desert cloud storm rain snow sun moon
star planet earth stone sand wave shore bridge tower castle village market harbor engine wheel rocket signal pocket button ladder basket
blanket candle mirror pillow window garden kettle rabbit turtle eagle tiger horse whale salmon spider insect flower orchard meadow
`);

/** Longer and trickier words: double letters, silent letters and uncommon letter pairs. */
export const ENGLISH_ADVANCED = list(`
accommodate acknowledge acquaintance acquiesce adjacent aesthetic aggravate allegiance ambiguous ambivalent amicable anachronism
analogous anomaly antithesis apparatus apprehensive arbitrary archetype articulate ascertain asymmetric atmosphere auspicious authentic
autonomous auxiliary belligerent benevolent bequeath bibliography bizarre bureaucracy cacophony camaraderie capricious catastrophe
cauliflower characteristic chrysanthemum circumference circumstantial coalesce cognizant coherent collaborate colloquial commemorate
commensurate committee comparative compatible complacent comprehensive conscientious consensus contemporary contingency convalesce
conundrum corroborate counterfeit credulous cryptic curriculum cylindrical debilitate deciduous definitely deliberate delineate
demeanor deprecate derivative desiccate deteriorate dexterity diaphragm dichotomy diligent dilemma disappoint discrepancy disparate
dissonance dubious ebullient eccentric eclectic efficacious egregious elaborate eloquent embarrass emphasize empirical encyclopedia
endeavor enigmatic enthusiasm entrepreneur ephemeral equanimity equilibrium equivocal esoteric euphemism exacerbate exaggerate
exhilarate exorbitant expedite extraordinary extravagant facetious fallacious fastidious feasible fluorescent forfeit fortuitous
frivolous fulfill garrulous gauge gregarious grievous guarantee hallucinate harass hemorrhage heterogeneous hierarchy hindrance
homogeneous hygiene hypocrisy hypothesis idiosyncrasy illegible illuminate immediately impeccable impetuous incandescent incessant
incoherent incongruous indefatigable indispensable ineffable inevitable infinitesimal ingenious inoculate innocuous insatiable
intermittent intricate intrinsic irascible irrelevant itinerary jeopardize juxtapose kaleidoscope knowledgeable labyrinth laconic
lackadaisical leisure liaison lieutenant loquacious lucrative luminescent magnanimous maintenance malleable maneuver mathematician
meticulous millennium miniature mischievous misspell mnemonic myriad necessary negligible nonchalant nostalgia nuisance oblivious
obsequious occasionally occurrence omnipotent onomatopoeia opportunity ostentatious paradigm paradox parallel parliament perennial
perfunctory perseverance perspicacious phenomenon philanthropy picturesque plagiarism plausible poignant possession precarious
precocious predicament prerogative prestigious pretentious privilege procrastinate proficient pronunciation propensity prosperous
psychology publicly pungent quandary querulous questionnaire quintessential rambunctious reconnaissance recommend reconcile
redundant referred relevant reminiscent renaissance repetition resilient restaurant resuscitate reticent rhetoric rhythm ridiculous
sacrilegious sagacious scrupulous separate sergeant serendipity silhouette simultaneous skeptical solicitous sophisticated spontaneous
squirrel strenuous subtle succinct superfluous supersede surreptitious surveillance susceptible symmetrical synchronize synonymous
tangible temperament tenacious threshold thoroughly tomorrow tranquil transcend ubiquitous unanimous unequivocal unprecedented
vacuum vehement venerable veracity vernacular vicarious vigilant vindicate volatile voracious whimsical withhold xylophone yacht
zealous zephyr quizzical jubilant juxtaposition buoyant gnarled knuckle psalm pneumonia rhinoceros scissors wednesday february
`);

/** Original quotes, from short to long. */
export const MORE_QUOTES = [
  'Fast hands start with a calm mind.',
  'Type the word in front of you, not the one you missed.',
  'Accuracy first. Speed shows up later.',
  'Small daily practice beats rare marathons.',
  'Rhythm is just patience that learned to dance.',
  'Every expert was once a beginner who kept going.',
  'Breathe out on the hard words.',
  'The keyboard rewards the steady, not the frantic.',
  'A good streak is built one quiet day at a time.',
  'Mistakes are only expensive when you rush past them.',
  'Look ahead, let your fingers catch up.',
  'Your best score is a message from your future self.',
  'Relax your shoulders and the words will flow.',
  'Precision is a habit you choose every keystroke.',
  'Slow is smooth, and smooth becomes fast.',
  'Today you are faster than you were last month.',
  'The space bar is a tiny pause to reset your focus.',
  'Curiosity turns practice into play.',
  'Clear thinking makes for clean typing.',
  'Count your progress in weeks, not in minutes.',
  'Good posture is the warm-up nobody talks about, yet it changes every session.',
  'Read a little ahead of where you type, and the text stops surprising you.',
  'When a word trips you up, type it three times slowly before moving on.',
  'Typing is a conversation between your eyes and your hands; keep it polite and unhurried.',
  'Speed is borrowed from tomorrow, but accuracy is earned today.',
  'The quiet click of a correct key is the most satisfying sound in the room.',
  'Learning to type well is mostly learning to trust what your hands already know.',
  'A personal best rarely feels dramatic. It usually feels like a calm minute that went right.',
  'If your wrists ache, the lesson is to rest, not to push harder.',
  'Practice the letters you avoid; they are where your next ten words per minute are hiding.',
  'Racing a friend is fun, but beating your own yesterday is the real victory.',
  'Consistency is what remains after motivation goes home for the night.',
  'Errors are just feedback that arrived a little early.',
  'Short sessions with full attention beat long ones spent half asleep.',
  'The best typists are not tense. They look almost bored, because nothing surprises them.',
  'Punctuation is where good rhythm goes to be tested, so give commas and quotes the same care as letters.',
  'A clean keyboard, a quiet room and ten focused minutes can do more than an hour of distracted drills.',
  'Numbers live on the top row for a reason: they ask you to reach without looking down.',
  'When your speed stalls, lower it on purpose for a week and watch your accuracy climb back up.',
  'Typing quickly is impressive; typing correctly the first time is useful.',
  'Every sentence you finish without looking down is a small vote for the typist you want to become.',
  'A good test ends the same way it began: shoulders down, eyes forward, breathing even.',
  'Think of each word as a single motion rather than a string of separate letters.',
  'Your fingers already know the way home; the home row is the place to come back to after every reach.',
  'The difference between ninety and a hundred words per minute is usually a handful of words you keep stumbling on.',
  'Typing is one of the few skills that improves every single time you use it, as long as you pay attention.',
  'When the timer starts, forget the score. Watch the text, keep the rhythm, and let the number take care of itself.',
  'Most people type far more each day than they realise, so even small improvements add up to hours saved over a year.',
  'There is a kind of quiet focus that comes from typing a long passage cleanly, the same calm you feel when a song finally clicks.',
  'Keep your eyes on the next word and your mind on the present one; the trick is learning to hold both at the same time.',
  'Some days your hands feel slow and clumsy. Those are the days to practise accuracy, because speed will not cooperate anyway.',
  'A friendly race can teach you more about pressure than a hundred solo tests, because suddenly every hesitation has a cost.',
  'If you find yourself holding your breath during a hard passage, let it out slowly and type the next word a little softer.',
  'Getting faster is less about moving your fingers quicker and more about wasting fewer motions on corrections and second guesses.',
  'The keyboard does not care how you felt this morning. It only answers the keys you press, so press them with intention.',
  'Your typing speed is a skill, not a talent. It grows exactly as much as the practice you put into it, no more and no less.',
  'Long passages reward patience. The first sentence warms your hands, the second settles your breathing, and the rest simply flows.',
  'When you can type a paragraph without thinking about the keyboard at all, writing stops being a chore and becomes a way of thinking.',
  'The best practice sessions end while you still want to keep going. Leave a little hunger for tomorrow and you will come back.',
  'Progress hides in the details: a slightly lighter touch, a steadier space bar, one less glance at the keys, a breath before a long word.',
  'Typing in a race is strange at first, because you can see everyone moving at once. Ignore their bars, find your rhythm, and trust it all the way to the finish.',
  'A great typing session feels like walking a familiar path at dusk. You do not watch your feet, you simply know where the next step goes and enjoy the evening air.',
  'Every typist hits a plateau eventually. The way through is rarely more speed; it is careful, almost boring repetition of the exact words and patterns that keep slowing you down.',
  'If you type for a living, your hands deserve the same care as an athlete would give their legs: stretch them, rest them, and stop before small aches turn into real problems.',
  'There is no secret technique hidden from beginners. The fastest typists simply practised the basics for longer than anyone else was willing to, and they kept their attention on accuracy the whole time.',
  'Whether you are writing an essay, answering messages or racing your friends, the same calm habits carry you forward: steady hands, patient eyes and a willingness to slow down when the words get difficult.',
  'The first time you notice that you typed a whole sentence without a single mistake, it feels like luck. The tenth time, it feels like skill. By the hundredth time, it simply feels normal.',
  'Good typing is quiet. There is no hammering on the keys, no frantic backspacing, just an even patter that sounds almost like rain on a window while your thoughts appear on the screen.'
];
