import { Context, Schema, h, Logger, noop } from 'koishi'
import { Rcon } from 'rcon-client'
import {} from '@koishijs/plugin-notifier'

export const name = 'rcon'

export interface Config {
  host: string
  port: number
  password: string
  maxRetry: number
  retryInterval: number
}

export const Config: Schema<Config> = Schema.object({
  host: Schema.string()
    .description("服务器IP")
    .default("127.0.0.1"),
  port: Schema.number()
    .description("Rcon端口")
    .default(25575),
  password: Schema.string()
    .description("Rcon密码"),
  maxRetry: Schema.number()
    .description("断开连接后的最大重试次数")
    .default(3),
  retryInterval: Schema.number()
    .description("重试间隔（毫秒）")
    .default(1000),
})

export const inject = ["notifier"]

export async function apply(ctx: Context, config: Config) {
  const rcon = new Rcon({
    host: config.host,
    port: config.port,
    password: config.password,
  })

  const notifier = ctx.notifier.create()
  let fatal = false

  async function reconnect() {
    notifier.update({type: "warning", content: "正在重连Rcon"})
    await ctx.sleep(500)
    try {
      await rcon.connect()
      notifier.update({type: "success", content: "连接Rcon成功"})
      fatal = false
    } catch (e) {
      // @ts-ignore
      notifier.update({type: "danger", content: <>
        <p>重连Rcon失败 {`${e.name}: ${e.message}`}</p>
        <p><button onclick={reconnect}>重连</button></p>
      </>})
    }
  }

  try {
    await rcon.connect()
    notifier.update({type: "success", content: "连接Rcon成功"})
  } catch (e) {
    fatal = true
    // @ts-ignore
    notifier.update({type: "danger", content: <>
      <p>连接Rcon失败 {`${e.name}: ${e.message}`}</p>
      <p><button onclick={reconnect}>重连</button></p>
    </>})
  }

  rcon.on("end", async () => {
    if (fatal) return
    let logger = new Logger("rcon")
    let flag = true
    for (let i = 0; i < config.maxRetry; i++) {
      notifier.update({type: "warning", content: `Rcon断开连接，正在第${i+1}次尝试重连`})
      await ctx.sleep(config.retryInterval)
      try {
        await rcon.connect()
        notifier.update({type: "success", content: "连接Rcon成功"})
        logger.info('成功重连Rcon')
        flag = false
        break
      } catch (e) {
        logger.warn(`重连Rcon失败，剩余重试次数：${config.maxRetry - i - 1} ` + e)
      }
    }
    // @ts-ignore
    if (flag) notifier.update({type: "danger", content: <>
      <p>Rcon断开连接, 已尝试重连{config.maxRetry}次 </p>
      <p><button onclick={reconnect}>重连</button></p>
    </>})
  })

  ctx.on("dispose", async () => {
    try {
      await rcon.end()
    } catch {
      noop()
    }
  })

  ctx.command('rcon <command:text>', '执行Rcon命令', {checkArgCount: true})
    .example("rcon time set day")
    .action(async ({ session }, command) => {
      try {
          let back = await rcon.send(command)
          back ? session.send(h.text(back)) : session.send('Rcon命令执行成功')
      } catch (e) {
        session.send('Rcon命令执行失败<br/>' + e)
      }
    })
}
