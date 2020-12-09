/**
 * A Lambda function that logs the payload received from a CloudWatch scheduled event.
 */
const pLimit = require('p-limit');
const Parser = require('rss-parser');
const parser = new Parser();
const { IncomingWebhook } = require('ms-teams-webhook');
const dayjs = require('dayjs');
require('dayjs/locale/ja');
dayjs.locale('ja')
const utc = require('dayjs/plugin/utc'); // dependent on utc plugin
const timezone = require('dayjs/plugin/timezone');
const localizedFormat = require('dayjs/plugin/localizedFormat');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter');
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(localizedFormat);
dayjs.extend(isSameOrAfter);

exports.handler = async (event, context, callback) => {
    // console.info(JSON.stringify(event));

    const teamsWebHookUrl = process.env.TEAMS_WEBHOOK_URL;
    const webhook = new IncomingWebhook(teamsWebHookUrl);
    const teamsWebHookLimit = Number(process.env.TEAMS_WEBHOOK_LIMIT);
    const executionIntervalHour = Number(process.env.EXECUTION_INTERVAL_HOUR);
    const limit = pLimit(teamsWebHookLimit);

    const rssList = JSON.parse(process.env.RSS_LIST);
    await Promise.all(rssList.map(async rss => {
        const feed = await parser.parseURL(rss.Url);
        console.log(JSON.stringify(feed));
        await Promise.all(feed.items.filter(item => {
            const targetTime = dayjs(event.time).subtract(executionIntervalHour, 'hour');
            // console.log(`targetTime=${targetTime.format()}`);
            // console.log(`itemTime=${dayjs(item.isoDate).format()}`);
            // console.log(`judge=${dayjs(item.isoDate).isSameOrAfter(targetTime)}`);
            return dayjs(item.isoDate).isSameOrAfter(targetTime);
        }).map(async item => {
            const displayTime = dayjs(item.isoDate).tz("Asia/Tokyo").format('llll');
            const sendBody = {
                "@type": "MessageCard",
                "@context": "https://schema.org/extensions",
                "summary": item.title,
                "themeColor": rss.themeColor || "FF9900", // Amazon Color
                "title": item.title,
                "sections": [
                    {
                        "activityTitle": `<a href=${item.link}>${displayTime}</a>`,
                        "activitySubtitle": item.categories.join(','),
                        "text": item.content,
                        "markdown": false // html mode
                    }
                ]
            };
            return await limit(() => webhook.send(JSON.stringify(sendBody)));
        }));
    }));
    callback(null, 'Success');
}
