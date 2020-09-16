const Koa = require('koa')
const Router = require('@koa/router')

const app = new Koa()
const router = new Router()

router
  .get('/data/players.json', ctx => {
    ctx.body = [{uuid: 'test1'}]
  })
app.use(router.routes())

app.listen(3000)
console.log(`🚀 Server is running.`)
