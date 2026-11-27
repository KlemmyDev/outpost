/**
 * First aid, in short steps for when it's happening. Written for Outpost in
 * plain words, following the Australian and New Zealand Committee on
 * Resuscitation (ANZCOR) guidelines and the usual Australian advice (the
 * National Asthma Council's 4×4×4, ASCIA for anaphylaxis, Poisons Information
 * 13 11 26). Each topic links to the full ANZCOR guideline, saved in the
 * Library's Australian guides, and to WikiMed when it's there.
 *
 * This is a reminder of what to do, not training. Shared with the page; no
 * Node imports.
 */

export type TopicGroup = 'Not breathing or unconscious' | 'Breathing and heart' | 'Injuries' | 'Bites and stings' | 'Illness' | 'Heat, cold and water'

export const TOPIC_GROUPS: TopicGroup[] = ['Not breathing or unconscious', 'Breathing and heart', 'Injuries', 'Bites and stings', 'Illness', 'Heat, cold and water']

export interface Topic {
  id: string
  title: string
  /** One line under the title. */
  summary: string
  group: TopicGroup
  /** Call 000 straight away, every time. */
  always000: boolean
  /** Other words people might search for. */
  aka: string[]
  steps: string[]
  /** When to call 000 (for topics that don't always need it), or what to tell them. */
  callWhen: string[]
  dont: string[]
  /** The ANZCOR guideline in the Library's Australian guides. */
  guide: string | null
  /** A WikiMed search for more. */
  more: string
}

export const TOPICS: Topic[] = [
  {
    id: 'cpr',
    title: 'Not breathing: CPR',
    summary: 'Unresponsive and not breathing normally.',
    group: 'Not breathing or unconscious',
    always000: true,
    aka: ['cardiac arrest', 'resuscitation', 'drsabcd', 'collapse', 'compressions', 'defibrillator', 'aed'],
    steps: [
      'Check for danger to you, bystanders and the person.',
      'Check for a response: talk to them, squeeze their shoulders.',
      'Send for help: call 000 (speaker on), and send someone for a defibrillator (AED).',
      'Open the airway: tilt the head back, lift the chin. Clear anything in the mouth.',
      'Look, listen and feel for normal breathing for up to 10 seconds. Gasping isn’t normal breathing.',
      'Start CPR: hands in the centre of the chest, push down a third of its depth, 100 to 120 a minute. Give 30 compressions, then 2 breaths.',
      'If you can’t or won’t give breaths, keep doing compressions without stopping.',
      'Turn on the AED as soon as it arrives and do what it says.',
      'Keep going until they respond, help takes over, or you can’t continue.',
    ],
    callWhen: ['Tell 000 the person is not breathing. They will talk you through CPR.'],
    dont: ['Don’t stop compressions for more than a few seconds.', 'Don’t wait for an AED to start CPR.'],
    guide: 'anzcor-cpr',
    more: 'cardiopulmonary resuscitation',
  },
  {
    id: 'unconscious',
    title: 'Unconscious but breathing',
    summary: 'Breathing normally but won’t respond.',
    group: 'Not breathing or unconscious',
    always000: true,
    aka: ['recovery position', 'fainted', 'passed out', 'unresponsive'],
    steps: [
      'Check for danger, then call 000.',
      'Roll them onto their side (the recovery position), with the top knee bent to keep them there.',
      'Tilt the head back slightly and face it a little down so fluid can drain from the mouth.',
      'Keep checking their breathing. If it stops or isn’t normal, start CPR.',
      'Keep them warm, and stay with them.',
    ],
    callWhen: [],
    dont: ['Don’t give them anything to eat or drink.', 'Don’t leave them on their back.'],
    guide: 'anzcor-unconscious',
    more: 'recovery position',
  },
  {
    id: 'choking',
    title: 'Choking',
    summary: 'Can’t breathe, cough or speak.',
    group: 'Breathing and heart',
    always000: false,
    aka: ['airway obstruction', 'something stuck', 'back blows', 'chest thrusts'],
    steps: [
      'If they can cough, get them to keep coughing. Stay with them.',
      'If coughing isn’t working, call 000.',
      'Adult or child: lean them forward and give up to 5 sharp blows between the shoulder blades with the heel of your hand.',
      'If that doesn’t clear it, give up to 5 chest thrusts: hand in the centre of the chest, sharper and slower than CPR.',
      'Keep alternating 5 back blows and 5 chest thrusts.',
      'Baby: lay them face down along your forearm, head lower, for back blows; then face up for chest thrusts with two fingers.',
      'If they become unresponsive, start CPR.',
    ],
    callWhen: ['Coughing doesn’t clear it.', 'They become unresponsive.'],
    dont: ['Don’t put your fingers down their throat to search for the object.'],
    guide: 'anzcor-choking-flowchart',
    more: 'choking',
  },
  {
    id: 'asthma',
    title: 'Asthma attack',
    summary: 'Wheeze, tight chest, hard to breathe.',
    group: 'Breathing and heart',
    always000: false,
    aka: ['wheezing', 'puffer', 'inhaler', 'ventolin', 'reliever', '4x4x4', 'shortness of breath'],
    steps: [
      'Sit them upright and stay calm with them.',
      'Give 4 separate puffs of a blue or grey reliever puffer, through a spacer if there is one: 1 puff, then 4 breaths, four times.',
      'Wait 4 minutes.',
      'If they can’t breathe normally, give 4 more puffs.',
      'If still not breathing normally, call 000, and keep giving 4 puffs every 4 minutes until the ambulance arrives.',
    ],
    callWhen: ['Straight away if they can’t speak, their lips are blue, or they’re getting worse fast.', 'If they aren’t better after the second 4 puffs.'],
    dont: ['Don’t leave them alone.'],
    guide: 'anzcor-asthma',
    more: 'asthma',
  },
  {
    id: 'anaphylaxis',
    title: 'Severe allergic reaction',
    summary: 'Anaphylaxis: swelling, breathing trouble, collapse.',
    group: 'Breathing and heart',
    always000: true,
    aka: ['anaphylaxis', 'epipen', 'anapen', 'adrenaline', 'allergy', 'bee sting allergy', 'nut allergy'],
    steps: [
      'Lay them flat. Don’t let them stand or walk. If breathing is hard, let them sit with legs out.',
      'Give the adrenaline autoinjector (EpiPen or Anapen) into the outer thigh, through clothes if needed.',
      'Call 000.',
      'If there’s no improvement after 5 minutes and another autoinjector is there, give it.',
      'If they have asthma too and you’re unsure which it is, give the adrenaline first, then the reliever puffer.',
      'If they stop breathing normally, start CPR.',
    ],
    callWhen: [],
    dont: ['Don’t stand them up, even if they seem better.', 'Don’t wait to see if it gets worse before using adrenaline.'],
    guide: 'anzcor-anaphylaxis',
    more: 'anaphylaxis',
  },
  {
    id: 'heart-attack',
    title: 'Heart attack',
    summary: 'Chest pain or pressure, often spreading to the arm, jaw or back.',
    group: 'Breathing and heart',
    always000: true,
    aka: ['chest pain', 'angina', 'cardiac', 'aspirin'],
    steps: [
      'Have them stop and rest, sitting or lying, whichever is easier.',
      'Call 000.',
      'Give 300 mg of aspirin to chew, unless they’re allergic or a doctor has told them not to.',
      'If they have angina medicine, help them take it as prescribed.',
      'Stay with them. If they stop breathing normally, start CPR.',
    ],
    callWhen: [],
    dont: ['Don’t let them drive themselves to hospital.'],
    guide: 'anzcor-heart-attack',
    more: 'myocardial infarction',
  },
  {
    id: 'stroke',
    title: 'Stroke',
    summary: 'Face drooping, arm weakness, slurred speech.',
    group: 'Breathing and heart',
    always000: true,
    aka: ['fast', 'face drooping', 'slurred speech', 'numbness', 'tia'],
    steps: [
      'Think FAST. Face: has it drooped? Arms: can they lift both? Speech: is it slurred or confused?',
      'Time: if you see any of these, call 000 straight away.',
      'Note the time the signs began; the hospital will ask.',
      'Keep them comfortable and stay with them. If they become unresponsive, recovery position; if not breathing, CPR.',
    ],
    callWhen: [],
    dont: ['Don’t give them anything to eat or drink.', 'Don’t wait to see if the signs pass.'],
    guide: 'anzcor-stroke',
    more: 'stroke',
  },
  {
    id: 'bleeding',
    title: 'Severe bleeding',
    summary: 'Bleeding that won’t stop.',
    group: 'Injuries',
    always000: false,
    aka: ['cut', 'wound', 'blood', 'tourniquet', 'haemorrhage', 'nosebleed'],
    steps: [
      'Press firmly on the wound with a pad or cloth, or your hands. Keep pressing.',
      'If blood soaks through, add more padding on top. Don’t lift it to check.',
      'Lay them down and keep them still and warm.',
      'If an arm or leg is bleeding heavily and pressure isn’t stopping it, put a tourniquet (or a wide band) high on the limb and tighten until the bleeding stops. Note the time.',
      'If something is stuck in the wound, leave it in and pad around it.',
      'Nosebleed: sit up, lean forward, pinch the soft part of the nose for 10 minutes.',
    ],
    callWhen: ['Bleeding is heavy or won’t stop with pressure.', 'They’re pale, sweaty, drowsy or confused (shock).', 'Something is stuck in the wound.'],
    dont: ['Don’t pull out an object stuck in a wound.', 'Don’t loosen a tourniquet once it’s on.'],
    guide: 'anzcor-bleeding',
    more: 'bleeding',
  },
  {
    id: 'burns',
    title: 'Burns',
    summary: 'Heat, chemical or electrical burns.',
    group: 'Injuries',
    always000: false,
    aka: ['scald', 'fire', 'chemical burn', 'electrical burn', 'sunburn'],
    steps: [
      'Make sure the danger is gone. For electrical burns, turn off the power first.',
      'Cool the burn under cool running water for 20 minutes. It still helps up to 3 hours later.',
      'Take off rings, watches and clothing from the area, unless stuck to the skin.',
      'Cover loosely with a non-stick dressing or cling film.',
      'Keep the rest of them warm.',
    ],
    callWhen: ['The burn is larger than the person’s palm, or deep.', 'It’s on the face, hands, feet, genitals or airway, or goes all the way around a limb.', 'It’s chemical or electrical, or the person is a baby, child or elderly.'],
    dont: ['Don’t use ice, butter, creams or oils.', 'Don’t burst blisters.'],
    guide: 'anzcor-burns',
    more: 'burn',
  },
  {
    id: 'head-injury',
    title: 'Head injury',
    summary: 'A knock to the head, concussion.',
    group: 'Injuries',
    always000: false,
    aka: ['concussion', 'knocked out', 'hit head'],
    steps: [
      'Keep them still and rest them. If neck injury is possible, support the head and don’t move them.',
      'Put a cold pack on the bump.',
      'Watch them closely for the next few hours.',
      'If they become unresponsive but are breathing, recovery position (keeping the head and neck in line).',
    ],
    callWhen: ['They were knocked out, even briefly.', 'Vomiting, a worsening headache, confusion, drowsiness, a seizure, or fluid from the nose or ears.', 'They’re on blood thinners.'],
    dont: ['Don’t let them go back to sport or activity the same day.'],
    guide: 'anzcor-head-injury',
    more: 'concussion',
  },
  {
    id: 'fracture',
    title: 'Broken bones and sprains',
    summary: 'Pain, swelling, an odd shape.',
    group: 'Injuries',
    always000: false,
    aka: ['fracture', 'broken arm', 'broken leg', 'sprain', 'dislocation', 'splint'],
    steps: [
      'Keep the injured part still, in the position you found it.',
      'Support it with padding, a sling or a splint so it can’t move.',
      'Put a cold pack wrapped in cloth on it for 20 minutes to ease pain and swelling.',
      'For a sprain: rest, cold, a firm bandage and keep it raised.',
    ],
    callWhen: ['A bone is through the skin, the limb is bent or pale below the injury, or it’s the thigh, hip, neck or back.', 'They’re in severe pain or shock.'],
    dont: ['Don’t try to straighten it.'],
    guide: null,
    more: 'bone fracture',
  },
  {
    id: 'snake-bite',
    title: 'Snake bite',
    summary: 'Any bite from a snake in Australia.',
    group: 'Bites and stings',
    always000: true,
    aka: ['snake', 'brown snake', 'tiger snake', 'pressure bandage', 'pressure immobilisation', 'envenomation'],
    steps: [
      'Call 000. Treat every snake bite as dangerous.',
      'Keep them still and calm. Lie them down.',
      'Apply a pressure bandage: a broad elastic bandage over the bite first, then wrap the whole limb from fingers or toes upwards, as firm as for a sprain.',
      'Splint the limb so it can’t bend, and keep them completely still.',
      'Mark the bite site on the bandage and note the time.',
      'If they stop breathing normally, start CPR.',
    ],
    callWhen: [],
    dont: ['Don’t wash the bite: venom on the skin helps identify the snake.', 'Don’t cut, suck or use a tourniquet.', 'Don’t try to catch the snake.', 'Don’t take the bandage off.'],
    guide: 'anzcor-snake-bite',
    more: 'snakebite',
  },
  {
    id: 'spider-bite',
    title: 'Spider bite',
    summary: 'Funnel-web needs a pressure bandage; redback needs cold.',
    group: 'Bites and stings',
    always000: false,
    aka: ['funnel web', 'redback', 'white tail', 'mouse spider'],
    steps: [
      'Funnel-web or mouse spider (or a big black spider and you’re not sure): call 000, then apply a pressure bandage and splint as for a snake bite, and keep them still.',
      'Redback or other spiders: wash the bite, then put a cold pack on it for pain.',
      'Watch for spreading pain, sweating, nausea or feeling unwell.',
    ],
    callWhen: ['Funnel-web or mouse spider, or an unknown big black spider.', 'Redback: severe pain, sweating, vomiting, or a child is bitten.'],
    dont: ['Don’t use a pressure bandage for a redback bite: it makes the pain worse.'],
    guide: 'anzcor-spider-bite',
    more: 'spider bite',
  },
  {
    id: 'marine-sting',
    title: 'Jellyfish and marine stings',
    summary: 'Box jellyfish, Irukandji, bluebottle, stonefish.',
    group: 'Bites and stings',
    always000: false,
    aka: ['jellyfish', 'box jellyfish', 'irukandji', 'bluebottle', 'stonefish', 'stingray', 'vinegar'],
    steps: [
      'Get them out of the water.',
      'Tropical waters (box jellyfish or Irukandji possible): call 000, pour vinegar over the sting for at least 30 seconds, and be ready to start CPR.',
      'Bluebottle: pick off any tentacles, rinse with seawater, then put the sting in hot water (as hot as is comfortable) for 20 minutes.',
      'Stonefish or stingray: put the area in hot water for pain; stingray wounds need medical care.',
    ],
    callWhen: ['Any sting in tropical waters.', 'Severe pain, breathing trouble, or they collapse.', 'A stingray wound to the chest or belly.'],
    dont: ['Don’t use vinegar on bluebottle stings.', 'Don’t rub the sting.'],
    guide: 'anzcor-marine',
    more: 'jellyfish sting',
  },
  {
    id: 'ticks-stings',
    title: 'Ticks, bees, wasps and ants',
    summary: 'Stings, and ticks that have attached.',
    group: 'Bites and stings',
    always000: false,
    aka: ['tick', 'bee sting', 'wasp', 'ant', 'paralysis tick'],
    steps: [
      'Bee: scrape the sting out sideways with a fingernail or card as soon as you can.',
      'Put a cold pack on the area for pain and swelling.',
      'Tick: freeze it with a spray from a pharmacy and let it drop off, or see a doctor; if you must remove it, use fine tweezers close to the skin.',
      'Watch for signs of a severe allergic reaction.',
    ],
    callWhen: ['Swelling of the face or throat, breathing trouble, or collapse: treat as anaphylaxis.'],
    dont: ['Don’t squeeze a tick’s body.'],
    guide: 'anzcor-ticks-stings',
    more: 'tick bite',
  },
  {
    id: 'seizure',
    title: 'Seizure',
    summary: 'Fitting, jerking, or blank and unresponsive.',
    group: 'Illness',
    always000: false,
    aka: ['fit', 'epilepsy', 'convulsion'],
    steps: [
      'Protect them from injury: move hard objects away, put something soft under the head.',
      'Time the seizure.',
      'When the jerking stops, roll them into the recovery position and check breathing.',
      'Stay with them, reassure them as they come round.',
    ],
    callWhen: ['It lasts more than 5 minutes, or another follows.', 'It’s their first seizure, they’re injured, pregnant, diabetic or in water.', 'They don’t come round, or aren’t breathing normally after.'],
    dont: ['Don’t hold them down.', 'Don’t put anything in their mouth.'],
    guide: 'anzcor-seizure',
    more: 'epileptic seizure',
  },
  {
    id: 'diabetes',
    title: 'Diabetic emergency',
    summary: 'Low blood sugar: shaky, sweaty, confused.',
    group: 'Illness',
    always000: false,
    aka: ['hypo', 'low blood sugar', 'insulin', 'diabetes'],
    steps: [
      'If they’re awake and can swallow, give fast sugar: jellybeans, juice or soft drink (not diet).',
      'Wait 15 minutes. If they’re not better, give more sugar.',
      'When they feel better, give something more filling, like a sandwich.',
      'If they become drowsy or unresponsive, recovery position.',
    ],
    callWhen: ['They’re unresponsive, can’t swallow, or aren’t improving.', 'They have a seizure.'],
    dont: ['Don’t give food or drink to someone who can’t swallow or isn’t fully awake.'],
    guide: 'anzcor-diabetic',
    more: 'hypoglycemia',
  },
  {
    id: 'poisoning',
    title: 'Poisoning and overdose',
    summary: 'Swallowed, breathed in, on the skin or in the eyes.',
    group: 'Illness',
    always000: false,
    aka: ['poison', 'overdose', 'swallowed', 'chemicals', 'medicines', 'opioid', 'naloxone', 'poisons information'],
    steps: [
      'If they’re unresponsive or having trouble breathing, call 000. Otherwise call Poisons Information on 13 11 26 (any time).',
      'Keep the container or packet to tell them what it was, how much, and when.',
      'On the skin: take off contaminated clothing and rinse with lots of water.',
      'In the eyes: rinse with gently running water for 15 minutes, eyelids open.',
      'Suspected opioid overdose: call 000, give naloxone if you have it, and start CPR if they’re not breathing normally.',
    ],
    callWhen: ['They’re unresponsive, drowsy, fitting, or having trouble breathing.'],
    dont: ['Don’t make them vomit.', 'Don’t give anything to eat or drink unless Poisons Information says to.'],
    guide: 'anzcor-poisoning',
    more: 'poisoning',
  },
  {
    id: 'shock',
    title: 'Shock',
    summary: 'Pale, cold, sweaty and faint after an injury or illness.',
    group: 'Illness',
    always000: true,
    aka: ['shock', 'faint', 'pale and clammy'],
    steps: [
      'Call 000.',
      'Lay them down. Treat the cause if you can (stop the bleeding).',
      'Keep them warm with a blanket, but don’t overheat them.',
      'Reassure them and watch their breathing.',
    ],
    callWhen: [],
    dont: ['Don’t give them anything to eat or drink.'],
    guide: 'anzcor-shock',
    more: 'shock circulatory',
  },
  {
    id: 'heat',
    title: 'Heat stroke and exhaustion',
    summary: 'Hot, confused or collapsed in the heat.',
    group: 'Heat, cold and water',
    always000: false,
    aka: ['heatstroke', 'heat exhaustion', 'overheating', 'hyperthermia', 'heatwave'],
    steps: [
      'Move them somewhere cool and shaded. Lay them down.',
      'Cool them fast: wet the skin and fan it, and put cold packs in the armpits, groin and on the neck. Cold water immersion is best if you can.',
      'Loosen or remove extra clothing.',
      'If they’re fully awake, give sips of cool water.',
    ],
    callWhen: ['They’re confused, drowsy, collapse, have a seizure, or stop sweating with hot skin: this is heat stroke.'],
    dont: ['Don’t give drinks to someone who isn’t fully awake.'],
    guide: 'anzcor-heat',
    more: 'heat stroke',
  },
  {
    id: 'hypothermia',
    title: 'Hypothermia',
    summary: 'Too cold: shivering, slurred, clumsy.',
    group: 'Heat, cold and water',
    always000: false,
    aka: ['cold', 'frostbite', 'exposure'],
    steps: [
      'Get them out of the cold and wind, and handle them gently.',
      'Take off wet clothing and wrap them in dry blankets, covering the head. Share body heat if needed.',
      'If they’re fully awake, give warm sweet drinks.',
      'Warm them gradually.',
    ],
    callWhen: ['They’re drowsy, confused, have stopped shivering, or are unresponsive.'],
    dont: ['Don’t rub their skin or use hot water bottles directly on it.', 'Don’t give alcohol.'],
    guide: 'anzcor-hypothermia',
    more: 'hypothermia',
  },
  {
    id: 'drowning',
    title: 'Drowning',
    summary: 'Pulled from the water.',
    group: 'Heat, cold and water',
    always000: true,
    aka: ['water', 'pool', 'surf', 'near drowning'],
    steps: [
      'Get them out of the water without putting yourself at risk.',
      'Call 000.',
      'If they’re not breathing normally, start CPR, beginning with 2 breaths.',
      'If they vomit, roll them onto their side to clear it, then continue.',
      'If they’re breathing, recovery position and keep them warm. They still need to be checked at hospital.',
    ],
    callWhen: [],
    dont: ['Don’t try to get water out of their lungs.'],
    guide: 'anzcor-drowning',
    more: 'drowning',
  },
]

export function topic(id: string): Topic | undefined {
  return TOPICS.find((t) => t.id === id)
}

/** Topics matching every word typed, title matches first. */
export function searchTopics(q: string): Topic[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return TOPICS.map((t) => {
    const title = t.title.toLowerCase()
    const hay = `${title} ${t.summary} ${t.aka.join(' ')}`.toLowerCase()
    if (!words.every((w) => hay.includes(w))) return null
    return { t, score: words.filter((w) => title.includes(w)).length * 10 + (t.aka.some((a) => a.startsWith(words[0]!)) ? 1 : 0) }
  })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.t)
}

/** The ANZCOR guides the topics link to, to save them in one go. */
export const FIRST_AID_GUIDES = [...new Set(TOPICS.map((t) => t.guide).filter((g): g is string => !!g)), 'anzcor-bls-flowchart', 'anzcor-choking-flowchart', 'anzcor-anaphylaxis-flowchart', 'anzcor-pressure-bandage', 'anzcor-managing-emergency']
