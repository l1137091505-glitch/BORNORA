# BORNORA 部署步骤

1. 在 GitHub 新建一个空的公开仓库，例如 `bornora`。不要额外创建 README、License 或 `.gitignore`。
2. 将本项目文件上传到仓库根目录。
3. 在 Vercel 选择 **Add New → Project**，导入该仓库。
4. **Root Directory** 选择 `frontend`，**Framework Preset** 选择 Vite，然后先完成一次部署。
5. 在 Remix 新建 `BornoraArchive.sol`，复制 `contracts/src/BornoraArchive.sol` 的全部内容。
6. 使用 Solidity **0.8.24** 编译。切换钱包到 BOT Chain Mainnet（Chain ID 677），部署 `BornoraArchive`；构造函数没有参数。
7. 复制部署后的完整合约地址。
8. 在 Vercel 项目打开 **Settings → Environment Variables**，新增：

```text
Key: VITE_BORNORA_ADDRESS
Value: 0x完整合约地址
Environment: Production
Type: Config
```

9. 回到 **Deployments**，对最新 Production 部署执行 **Redeploy**，不要勾选旧的 Build Cache。
10. 打开网页，点击 **Connect wallet**。网页会列出 EIP-6963、多提供商扩展或普通注入钱包，并在需要时提示添加/切换 BOT Chain。

合约地址是公开配置，不要设为 Secret。绝对不要把钱包私钥、助记词或 Vercel Token 填进环境变量。首次操作请只使用少量 BOT 测试。
