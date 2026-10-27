# 部署 CampusHub

## 本机运行

安装 Node.js 22 或更新版本及 pnpm，在项目目录运行：

```sh
pnpm install --frozen-lockfile
pnpm start
```

打开 `http://127.0.0.1:4173`。无需构建，Node 服务直接提供静态文件和 ICS 解析接口。

运行测试：

```sh
pnpm test
```

## 同一 Wi-Fi 下访问

指定这台电脑实际使用的局域网 IPv4 地址：

```sh
node server.cjs --lan=192.168.1.10
```

默认端口为 4174。手机连接相同网络后打开 `http://192.168.1.10:4174`，具体地址以启动输出为准。

## 自定义域名

配置 HTTPS 反向代理或 Cloudflare Tunnel，将自己的域名转发至运行服务的电脑：

```sh
node server.cjs --public-origin=https://your-domain.example
```

源服务仍监听 `127.0.0.1:4173`。代理应保留域名对应的 Host 和 HTTPS Origin，不改写为 localhost；服务只接受显式配置的域名。Cloudflare Tunnel 的源服务地址填写 `http://127.0.0.1:4173`。隧道凭据单独存放在项目外，不上传 GitHub。

本机部署需要电脑保持开机、联网且服务持续运行；如需持续可用，可将同样的 Node 服务部署到支持常驻进程的服务器。

## GitHub 与数据

上传 GitHub 仅保存项目源码，不会自动部署网站。GitHub Pages 不能运行此项目的 Node 日历接口；完整使用 URL/文件 ICS 预览导入，需要运行 Node 服务。

用户数据保存在浏览器本地，没有服务端账户或数据同步。更换域名、浏览器或设备后，可通过应用中的同步码手动迁移。同步码可能包含个人资料和账密密文，请勿提交到仓库或 Issue。
