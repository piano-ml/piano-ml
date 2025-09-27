// Simple test pour vérifier la génération XML avec doigtés
const fs = require('fs');

// Mock data pour tester
const testExercise = {
  title: "Test Fingering",
  deckName: "Test",
  type: "scale",
  advice: "Test fingering generation",
  measure: 4,
  beat: { numerator: 4, denominator: 4 },
  tempo: 60,
  octaveShift: 0,
  repeat: 1,
  patternRightHand: [
    { note: [1], duration: 4, finger: [1] },
    { note: [2], duration: 4, finger: [2] },
    { note: [3], duration: 4, finger: [3] },
    { note: [4], duration: 4, finger: [4] },
  ],
  patternLeftHand: [
    { note: [1], duration: 4, finger: [5] },
    { note: [2], duration: 4, finger: [4] },
    { note: [3], duration: 4, finger: [3] },
    { note: [4], duration: 4, finger: [2] },
  ]
};

const testScale = {
  kind: "Scale",
  name: "Major",
  pattern: [2, 2, 1, 2, 2, 2, 1]
};

console.log("Test data created. You can use this to test the fingering generation manually.");
console.log("Exercise:", JSON.stringify(testExercise, null, 2));
console.log("Scale:", JSON.stringify(testScale, null, 2));