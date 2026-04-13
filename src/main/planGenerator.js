const ntBooksDict = {
  'Matthew': 28, 'Mark': 16, 'Luke': 24, 'John': 21, 'Acts': 28,
  'Romans': 16, '1 Corinthians': 16, '2 Corinthians': 13, 'Galatians': 6,
  'Ephesians': 6, 'Philippians': 4, 'Colossians': 4, '1 Thessalonians': 5,
  '2 Thessalonians': 3, '1 Timothy': 6, '2 Timothy': 4, 'Titus': 3,
  'Philemon': 1, 'Hebrews': 13, 'James': 5, '1 Peter': 5, '2 Peter': 3,
  '1 John': 5, '2 John': 1, '3 John': 1, 'Jude': 1, 'Revelation': 22
};

const otBooksDict = {
  'Genesis': 50, 'Exodus': 40, 'Leviticus': 27, 'Numbers': 36, 'Deuteronomy': 34,
  'Joshua': 24, 'Judges': 21, 'Ruth': 4, '1 Samuel': 31, '2 Samuel': 24,
  '1 Kings': 22, '2 Kings': 25, '1 Chronicles': 29, '2 Chronicles': 36,
  'Ezra': 10, 'Nehemiah': 13, 'Esther': 10, 'Job': 42, 'Psalms': 150,
  'Proverbs': 31, 'Ecclesiastes': 12, 'Song of Solomon': 8, 'Isaiah': 66,
  'Jeremiah': 52, 'Lamentations': 5, 'Ezekiel': 48, 'Daniel': 12,
  'Hosea': 14, 'Joel': 3, 'Amos': 9, 'Obadiah': 1, 'Jonah': 4,
  'Micah': 7, 'Nahum': 3, 'Habakkuk': 3, 'Zephaniah': 3, 'Haggai': 2,
  'Zechariah': 14, 'Malachi': 4
};

const allBooksDict = { ...otBooksDict, ...ntBooksDict };

function formatBucket(bucket) {
  if (!bucket || bucket.length === 0) {
     return { reference: "", book: "", startChapter: 1, endChapter: 1 };
  }
  if (bucket.length === 1) {
    return {
      reference: `${bucket[0].book} ${bucket[0].chapter}`,
      book: bucket[0].book,
      startChapter: bucket[0].chapter,
      endChapter: bucket[0].chapter
    };
  }
  if (bucket[0].book === bucket[bucket.length-1].book) {
    return {
      reference: `${bucket[0].book} ${bucket[0].chapter}-${bucket[bucket.length-1].chapter}`,
      book: bucket[0].book,
      startChapter: bucket[0].chapter,
      endChapter: bucket[bucket.length-1].chapter
    };
  }
  return {
    reference: `${bucket[0].book} ${bucket[0].chapter}; ${bucket[bucket.length-1].book} ${bucket[bucket.length-1].chapter}`,
    book: bucket[0].book,
    startChapter: bucket[0].chapter,
    endChapter: bucket[bucket.length-1].chapter
  };
}

function buildTrack(booksArr, targetDays) {
  let allChaps = [];
  for (const b of booksArr) {
    const chapCount = allBooksDict[b];
    if (chapCount) {
      for (let c = 1; c <= chapCount; c++) {
        allChaps.push({ book: b, chapter: c });
      }
    }
  }

  // If the total chapters are less than the targetDays, we simply loop them!
  if (allChaps.length > 0 && allChaps.length < targetDays) {
    let loopedChaps = [];
    let i = 0;
    while (loopedChaps.length < targetDays) {
      loopedChaps.push(allChaps[i % allChaps.length]);
      i++;
    }
    return loopedChaps.map(c => formatBucket([c]));
  }

  let buckets = [];
  for (let i = 0; i < targetDays; i++) {
    let startIndex = Math.round(i * allChaps.length / targetDays);
    let endIndex = Math.round((i + 1) * allChaps.length / targetDays);
    buckets.push(allChaps.slice(startIndex, endIndex));
  }
  return buckets.map(formatBucket);
}

function buildAlternatingTrack(booksArr, targetDays) {
  const allBookChapters = booksArr.map(b => {
    const chapCount = allBooksDict[b] || 0;
    const chapters = [];
    for (let c = 1; c <= chapCount; c++) {
      chapters.push({ book: b, chapter: c });
    }
    return chapters;
  }).filter(c => c.length > 0);

  const generateSequence = () => {
    const queues = allBookChapters.map(chapters => [...chapters]);
    let slots = [];
    if (queues.length > 0) slots.push(queues.shift());
    if (queues.length > 0) slots.push(queues.shift());

    const seq = [];
    let turn = 0;

    while (slots.length > 0) {
      const activeSlotIndex = turn % slots.length;
      const activeQueue = slots[activeSlotIndex];
      
      const chap = activeQueue.shift();
      seq.push(chap);

      if (activeQueue.length === 0) {
        if (queues.length > 0) {
          slots[activeSlotIndex] = queues.shift();
        } else {
          slots.splice(activeSlotIndex, 1);
          continue; 
        }
      }
      turn++;
    }
    return seq;
  };

  let seq = generateSequence();
  if (seq.length === 0) return Array(targetDays).fill({ reference: "", book: "", startChapter: 1, endChapter: 1 });

  while (seq.length < targetDays) {
    seq = seq.concat(generateSequence());
  }

  return seq.slice(0, targetDays).map(c => formatBucket([c]));
}

function generateDevotePlan() {
  const balancedNtOrder = [
    'Matthew', 'Acts', 'Romans', 'Mark', '1 Corinthians', '2 Corinthians',
    'Galatians', 'Ephesians', 'Luke', 'Philippians', 'Colossians',
    '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy',
    'Titus', 'Philemon', 'Hebrews', 'John', 'James', '1 Peter',
    '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation'
  ];
  let ntDays = buildTrack(balancedNtOrder, 183);
  let psalmDays = buildTrack(['Psalms'], 182);

  let finalPlan = [];
  let dayCounter = 1;
  for (let i = 0; i < Math.max(ntDays.length, psalmDays.length); i++) {
    if (i < ntDays.length) {
      finalPlan.push({ day: dayCounter++, ...ntDays[i] });
    }
    if (i < psalmDays.length) {
      finalPlan.push({ day: dayCounter++, ...psalmDays[i] });
    }
  }
  return finalPlan;
}

function getReadingForDay(planType, customBooks, dayNum) {
  // Ensure dayNum matches 1-365
  let effectiveDay = ((dayNum - 1) % 365) + 1;
  let plan = [];

  if (planType === 'custom' && customBooks && customBooks.length > 0) {
    let days = buildAlternatingTrack(customBooks, 365);
    plan = days.map((d, idx) => ({ day: idx + 1, ...d }));
  } else {
    plan = generateDevotePlan();
  }

  return plan.find(p => p.day === effectiveDay) || plan[0];
}

export {
  getReadingForDay,
  allBooksDict
};
