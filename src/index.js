/**
 * A Lambda function that logs the payload received from a CloudWatch scheduled event.
 */
const AWS = require('aws-sdk');
const Translate = new AWS.Translate();

const pLimit = require('p-limit');
const Parser = require('rss-parser');
const parser = new Parser();
const { IncomingWebhook } = require('ms-teams-webhook');
const dayjs = require('dayjs');
require('dayjs/locale/ja');
const utc = require('dayjs/plugin/utc'); // dependent on utc plugin
const timezone = require('dayjs/plugin/timezone');
const localizedFormat = require('dayjs/plugin/localizedFormat');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter');
dayjs.locale('ja')
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(localizedFormat);
dayjs.extend(isSameOrAfter);

exports.handler = async (event, context, callback) => {
    console.info(JSON.stringify(event));

    const teamsWebHookUrl = process.env.TEAMS_WEBHOOK_URL;
    const webhook = new IncomingWebhook(teamsWebHookUrl);
    const teamsWebHookLimit = Number(process.env.TEAMS_WEBHOOK_LIMIT);
    const executionIntervalHour = Number(process.env.EXECUTION_INTERVAL_HOUR);
    const webHookLimit = pLimit(teamsWebHookLimit);
    const translateLimit = pLimit(2);

    const rssList = JSON.parse(process.env.RSS_LIST);
    await Promise.all(rssList.map(async rss => {
        const feed = await parser.parseURL(rss.Url);
        // console.log(JSON.stringify(feed));
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
                        "activityTitle": `<a href=${item.link}>${rss.title}: ${displayTime}</a>`,
                        "activitySubtitle": item.categories.join(','),
                        "text": item.content,
                        "markdown": false // html mode
                    }
                ],
                "potentialAction": [
                    {
                        "@type": "OpenUri",
                        "name": "記事を読む",
                        "targets": [
                            {
                                "os": "default",
                                "uri": item.link
                            }
                        ]
                    }
                ]
            };
            if (rss.translation) {
                const titleParams = {
                    Text: item.title,
                    SourceLanguageCode: 'en',
                    TargetLanguageCode: 'ja',
                }
                const contentParams = {
                    Text: item.contentSnippet,
                    SourceLanguageCode: 'en',
                    TargetLanguageCode: 'ja',
                }
                // const jaTitle = await translateLimit(() => Translate.translateText(titleParams).promise());
                // const jaContent = await translateLimit(() => Translate.translateText(contentParams).promise());
                // const jaTitle = item.title;//await  Translate.translateText(titleParams).promise();
                // const jaContent = item.contentSnippet;//await Translate.translateText(contentParams).promise();
                const jaTitle = await Translate.translateText(titleParams).promise();
                const jaContent = await Translate.translateText(contentParams).promise();

                sendBody.sections.push({
                    "activityTitle": jaTitle.TranslatedText,
                    "activitySubtitle": "",
                    "text": jaContent.TranslatedText,
                    "markdown": false // html mode
                })
            }
            return await webHookLimit(() => webhook.send(JSON.stringify(sendBody)));
        }));
    }));
    callback(null, 'Success');
}
