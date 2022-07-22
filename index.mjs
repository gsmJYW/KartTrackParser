import mysql from 'mysql2/promise'
import { parse } from 'node-html-parser'
import UserAgent from 'user-agents'
import { Builder, By } from 'selenium-webdriver'
import { Options, ServiceBuilder } from 'selenium-webdriver/chrome.js'
import { ensureChromedriver } from 'node-chromedriver-downloader'

const args = process.argv.slice(2)

if (args.length < 4) {
    console.error('Parameters not provided: [host] [user] [password] [database]')
    exit(1)
}

const pool = mysql.createPool({
    host: args[0],
    user: args[1],
    password: args[2],
    database: args[3],
    connectionLimit: 100,
})

const chromedriverBinaryPath = await ensureChromedriver()
const service = new ServiceBuilder(chromedriverBinaryPath)

const valueList = []

const driver = await buildDriver()
await driver.get('https://namu.wiki/w/틀:카트라이더의%20트랙')
await driver.sleep(2000)

const fieldList = await driver.findElements(By.css('div > ._9aWHT0p5'))
const linkList = []

for (const field of fieldList) {
    const innerText = await field.getAttribute('innerText')

    if (innerText.length > 0 & !innerText.includes('트랙 목록')) {
        linkList.push(await field.getAttribute('href'))
    }
}

driver.quit()
let progress = 0

console.clear()
console.log(`${progress}/${linkList.length}`)

for (const link of linkList) {
    const driver = await buildDriver()
    await driver.get(link)
    await driver.sleep(2000)

    const body = await driver.findElement(By.css('body'))
    const html = await body.getAttribute('innerHTML')
    const document = parse(html)

    const tableList = document.querySelectorAll('._f0b7325cc9e2662864c573d822bf4dca')

    for (const table of tableList) {
        const track = {}

        track.name = table.innerText.split('<')[0]

        const image = table.querySelector('._9a-tQ-Jz')
        track.imageUrl = `https:${image.getAttribute('src')}`

        track.name = track.name.replace('[R]', '[리버스]')
        track.reverse = track.name.includes('리버스')

        track.difficulty = (table.innerText.match(/●/g) || []).length

        track.speed = table.innerText.includes('스피드')

        if (!track.speed && !table.innerText.includes('아이템') || table.innerText.includes('랜덤')) {
            continue
        }

        let type = table.innerText.split('난이도')[0].split('>').pop().replaceAll(/ /g, '')

        track.normal = type.includes('노멀')

        track.veryHard = type.includes('베리하드')
        type = type.replace('베리하드', '')

        track.hard = type.includes('하드')
        valueList.push(`('${track.name}', '${track.imageUrl}', ${track.difficulty}, ${track.reverse}, ${track.speed}, ${track.normal}, ${track.hard}, ${track.veryHard})`)
    }

    driver.quit()

    progress++
    console.clear()
    console.log(`${progress}/${linkList.length}`)
}

pool.query(`INSERT IGNORE INTO track (name, image_url, difficulty, reverse, speed, normal, hard, very_hard) VALUES ${valueList.join(',')}`).then(() => process.exit(0))

function buildDriver(device = 'desktop') {
    return new Promise(async (resolve, reject) => {
        try {
            const options = new Options()
            options.addArguments(`user-agent=${new UserAgent([/Chrome/, { 'deviceCategory': device }])}`)
            options.addArguments('no-sandbox', 'headless')

            const driver = await new Builder()
                .withCapabilities({ 'pageLoadStrategy': 'none' })
                .forBrowser('chrome')
                .setChromeOptions(options)
                .setChromeService(service)
                .build()

            resolve(driver)
        }
        catch (error) {
            reject(error)
        }
    })
}