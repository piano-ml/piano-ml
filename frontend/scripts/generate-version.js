#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getCommitHash() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch (e) {
    return 'unknown';
  }
}

function getDate() {
  return new Date().toISOString();
}

const versionInfo = {
  date: getDate(),
  commit: getCommitHash(),
};

const outPath = path.join(__dirname, '../src/assets/version.json');
fs.writeFileSync(outPath, JSON.stringify(versionInfo, null, 2));
console.log('Version info written to', outPath);
