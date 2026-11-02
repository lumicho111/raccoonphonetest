# float 安卓内置版 1.0.1（更新测试版）

这是把界面和静态资源装进 APK 的版本，不是打开远程网页的壳。包名固定 `app.ii.phone`，本地网页源固定 `https://localhost`；后续不要更改，否则可能无法覆盖安装或读取旧数据。

## 首次使用

1. 在浏览器版的「设置 → 数据管理」导出完整备份，确认文件实际保存成功。不要清空浏览器数据。
2. 安装 APK；这是独立的数据空间，不会自动读取浏览器记录。
3. 先在 APK 中用少量数据验证，再从「数据管理」导入备份。
4. 聊天、语音、音乐等服务使用自己的 API 设置。需要网站代理/社区等功能时，在「设置 → 安卓应用」填写你信任的原网站 HTTPS 根地址。空白时本地界面仍可使用，但这些服务器功能会给出明确错误。

## 目前边界

- 已完成网页生产构建、安卓签名构建与静态签名检查。网页内置资源的首次锁屏及解锁桌面已检查。没有安卓设备/模拟器安装运行验证；相机、录音、文件恢复、软键盘和系统返回仍需实机测试。
- 不承诺所有线上功能与网页完全等价。原网站若要求登录 cookie、跨域授权或校验本站来源，需要进一步适配该网站；APK 不复制浏览器登录状态。
- Android 原生请求桥只转发相同本地源的 `/api/` 请求至设置的网站，外部 API 地址不会被静默改写。该服务器路径的流式响应目前会缓冲后返回；终止客户端等待不等于服务端已取消。此桥暂不支持 multipart 网站表单上传（返回明确的 501），不影响普通系统相册文件选择和本地备份导入。
- 文件导出通过安卓分享/保存面板，导出文件先放应用缓存；请在系统面板实际保存到文件位置后再认为备份成功。
- 网页 Service Worker 不在 APK 中注册，避免旧网页缓存覆盖安装包代码。网页 Web Push 不会自动变成安卓原生推送；1.0.1 已接入安卓本地消息通知，但没有实现原生后台常驻、FCM 或自动下载更新；应用进程已结束时，不会因此继续生成消息或收到远程推送。
- HTTPS 页面不允许混入不安全的 HTTP 资源；优先使用 HTTPS API 地址。
- 不清除 IndexedDB/localStorage；覆盖安装的数据兼容仍需要真实备份进行升级验证。不要卸载旧版来更新。

## 后续构建和覆盖更新

环境：Node 20.19+（此次使用 Node 24）、完整 JDK 17（不是仅 JRE）、Android SDK 35 / Build Tools 35，首次构建需联网下载依赖。

1. 解压完整工程；执行 `npm ci`。
2. 把私人签名备份的 `float-release.p12` 与 `signing.properties` 放到 `android/` 目录。这些文件不在工程包中，不要提交到公开仓库。
3. 配置 `ANDROID_HOME` 或在 `android/local.properties` 填本机 SDK 路径。
4. 修改 `mobile/version.json`：每次发布将 `versionCode` 增大，并更新 `versionName`。保持 `applicationId` 不变。
5. 执行 `npm run android:apk`。脚本会重新构建网页、同步内置资源、生成同签名 APK。
6. 输出 `android/app/build/outputs/apk/release/app-release.apk`，传到手机覆盖安装。

本次版本：versionCode 2 / versionName 1.0.1；首次版本：versionCode 1 / versionName 1.0.0。没有使用临时 debug 签名，禁止以后改用另一套签名。

## 检查

- `node scripts/check-android-runtime.cjs`
- `node scripts/check-social-identities.cjs`
- `npx tsc --noEmit --incremental false`
- `npm run android:web`
- Android `assembleRelease`

原项目网页端仍用 Next.js 的 `npm run build`；安卓单独用 Vite 打包纯客户端，不把 Next.js 服务端路由假装成离线代码。原有 AGPL-3.0 LICENSE / NOTICE 保留。

## 1.0.1 数据保护与验证范围

- 保持包名、签名及本地 origin 不变；读取完成前阻止默认空值写回，读取失败阻止覆盖。旧存储迁移成功落盘后才删除旧副本。
- 升级前保存独立 KV 恢复快照（保留最近两份），不包括完整聊天和媒体，也不自动回滚；它不能替代「数据管理」导出的完整备份。
- 写入失败显示提醒，KV 同步写入及新聊天消息的失败队列支持重试；其他异步写入失败会提醒，不保证全部自动重试。
- 已执行真实 IndexedDB 模拟故障检查、追发标记检查、类型检查、身份披露和 YouTube 返回回归检查、Vite 生产构建及安卓签名构建。浏览器预览检查了锁屏入口、弹窗和桌面。没有真实安卓升级、通知权限或语音服务实机验证。
- 冒险翻译掉格式问题尚无可复现样例，本次保留既有解析与原文回退，不宣称所有格式问题已修复。
