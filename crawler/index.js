const fs = require('fs-extra')
const {resolve} = require('path')
const dayjs = require('dayjs')
const fetch = require('node-fetch')
const pako = require('pako')

const DOMAIN = 'https://stats.craft.moe'

// Directory structure:
//
//  (@)
//   ├─ batches
//   │   └─ ...
//   ├─ crawler
//   │   └─ (this script)
//   ├─ BATCH_NO
//   └─ index.json

const BATCH_NO = dayjs().format('YYYYMMDD_HHmmss')
const STORAGE_DIR = resolve(__dirname, '..')
const BATCH_DIR = resolve(STORAGE_DIR, 'batches', BATCH_NO)

void async function main() {
  /* 1. prepare all the directories and files we may need */

  fs.ensureDirSync(BATCH_DIR)
  fs.writeFileSync(resolve(__dirname, '../BATCH_NO'), BATCH_NO, 'utf-8')

  /* 2. read players.json from last batch to check if a player has updates recently */

  const INDEX_JSON = resolve(STORAGE_DIR, 'index.json')
  const indexJson = readFile(INDEX_JSON) || {}
  const LAST_BATCH = indexJson.latest_batch || 0
  const lastPlayersJson = readFile(resolve(STORAGE_DIR, 'batches', LAST_BATCH, 'players.json.gz')) || []

  /* 3. fetch all the stats.json to: 1) store updated data; 2) collect banned uuids */

  const playersJson = await fetchFile('/data/players.json')
  const uuidsBanned = []
  let hasUpdate = false
  let updateCount = 0
  for (const {uuid} of playersJson) {
    const lastSeen = (lastPlayersJson.find(p => p.uuid === uuid) || {seen: 0}).seen
    const statsJson = await fetchFile(`/data/${uuid}/stats.json`)
    if (statsJson.data.seen !== lastSeen) {
      hasUpdate = true
      updateCount++
      writeFile(`${uuid}.json.gz`, statsJson)
    }
    if (statsJson.data.banned) {
      uuidsBanned.push(uuid)
    }
  }
  console.log(`Players updated: ${updateCount}`)

  /* 4. check if banned uuids has been updated */

  const lastBannedStr = (indexJson.banned_uuids || []).join()
  const bannedStr = uuidsBanned.sort().join()
  if (lastBannedStr !== bannedStr) {
    hasUpdate = true
    indexJson.banned_uuids = uuidsBanned
  }

  /* 5. if any update stored, write other meta json files and index.json */

  if (hasUpdate) {
    writeFile('info.json', await fetchFile('/data/info.json'))
    writeFile('players.json.gz', playersJson)
    indexJson.latest_batch = BATCH_NO
    fs.outputJsonSync(INDEX_JSON, indexJson)
  }

  console.log('Done')
}()

async function fetchFile(url) {
  url = DOMAIN + url
  console.log(`Fetching ${url}`)
  return await fetch(url).then(res => res.json())
}

function readFile(filePath) {
  if (fs.existsSync(filePath)) {
    const file = filePath.endsWith('.gz')
      ? pako.ungzip(fs.readFileSync(filePath), {to: 'string'})
      : fs.readFileSync(filePath, 'utf-8')
    return /\.json(\.gz)?$/.test(filePath) ? JSON.parse(file) : file
  }
}

function writeFile(filePath, file) {
  if (filePath.endsWith('.gz')) {
    fs.writeFileSync(resolve(BATCH_DIR, filePath), pako.gzip(JSON.stringify(file)))
  } else {
    fs.outputJsonSync(resolve(BATCH_DIR, filePath), file)
  }
}
