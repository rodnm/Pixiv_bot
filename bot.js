import { Telegraf } from 'telegraf'
// import { telegrafThrottler } from 'telegraf-throttler'
import config from './config.js'

export const tgBot = new Telegraf(config.tg.token)
// const throttler = telegrafThrottler({
//     in: {
//         maxConcurrent: 1,
//         minTime: 2000,
//         highWater: 3
//     },
//     out: {
//         minTime: 25,
//         reservoir: 3
//     },
//     group: {
//         maxConcurrent: 1,
//         minTime: 2000,
//         reservoir: 3
//     }
// })
// tgBot.use(throttler)
// see https://github.com/telegraf/telegraf/issues/1323
tgBot.on('channel_post', (ctx, next) => {
    ctx.update.message = ctx.update.channel_post
    next()
})