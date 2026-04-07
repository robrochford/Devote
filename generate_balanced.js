const fs = require('fs');

const ntBooks = [
  { name: 'Matthew', chapters: 28 },
  { name: 'Acts', chapters: 28 },
  { name: 'Romans', chapters: 16 },
  { name: 'Mark', chapters: 16 },
  { name: '1 Corinthians', chapters: 16 },
  { name: '2 Corinthians', chapters: 13 },
  { name: 'Galatians', chapters: 6 },
  { name: 'Ephesians', chapters: 6 },
  { name: 'Luke', chapters: 24 },
  { name: 'Philippians', chapters: 4 },
  { name: 'Colossians', chapters: 4 },
  { name: '1 Thessalonians', chapters: 5 },
  { name: '2 Thessalonians', chapters: 3 },
  { name: '1 Timothy', chapters: 6 },
  { name: '2 Timothy', chapters: 4 },
  { name: 'Titus', chapters: 3 },
  { name: 'Philemon', chapters: 1 },
  { name: 'Hebrews', chapters: 13 },
  { name: 'John', chapters: 21 },
  { name: 'James', chapters: 5 },
  { name: '1 Peter', chapters: 5 },
  { name: '2 Peter', chapters: 3 },
  { name: '1 John', chapters: 5 },
  { name: '2 John', chapters: 1 },
  { name: '3 John', chapters: 1 },
  { name: 'Jude', chapters: 1 },
  { name: 'Revelation', chapters: 22 }
];

let allNtChaps = [];
for (const b of ntBooks) {
  for (let c = 1; c <= b.chapters; c++) {
    allNtChaps.push({ book: b.name, chapter: c });
  }
}

let ntBuckets = [];
for (let i = 0; i < 183; i++) {
  let startIndex = Math.round(i * 260 / 183);
  let endIndex = Math.round((i + 1) * 260 / 183);
  ntBuckets.push(allNtChaps.slice(startIndex, endIndex));
}

function formatNtBucket(bucket) {
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
  // format across books
  return {
    reference: `${bucket[0].book} ${bucket[0].chapter}; ${bucket[bucket.length-1].book} ${bucket[bucket.length-1].chapter}`,
    book: bucket[0].book,
    startChapter: bucket[0].chapter,
    endChapter: bucket[bucket.length-1].chapter
  };
}

let ntDays = ntBuckets.map(formatNtBucket);

let psalmDays = [];
for (let i = 0; i < 182; i++) {
  let psNum = (i % 150) + 1;
  psalmDays.push({
    reference: `Psalm ${psNum}`,
    book: 'Psalms',
    startChapter: psNum,
    endChapter: psNum
  });
}

let finalPlan = [];
let dayCounter = 1;
for (let i = 0; i < Math.max(ntDays.length, psalmDays.length); i++) {
  if (i < ntDays.length) {
    finalPlan.push({
      day: dayCounter++,
      ...ntDays[i]
    });
  }
  if (i < psalmDays.length) {
    finalPlan.push({
      day: dayCounter++,
      ...psalmDays[i]
    });
  }
}

fs.writeFileSync('f:/Desktop/Electrode Active/Devote/resources/reading_plan.json', JSON.stringify(finalPlan, null, 2));
console.log('Successfully generated reading_plan.json with length: ', finalPlan.length);
