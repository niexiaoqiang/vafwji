# ================================
# 第一阶段：构建环境
# ================================
FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制依赖配置文件
COPY package*.json ./

# 安装所有依赖（包括开发依赖，用于构建前端）
RUN npm ci

# 复制源代码
COPY . .

# 构建前端应用
RUN npm run build

# ================================
# 第二阶段：生产运行环境
# ================================
FROM node:18-alpine AS runner

# 设置生产环境变量
ENV NODE_ENV=production

# 创建应用目录
WORKDIR /app

# 创建非root用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodeuser

# 复制依赖配置文件
COPY package*.json ./

# 仅安装生产依赖
RUN npm ci --only=production && npm cache clean --force

# 从构建阶段复制构建产物
COPY --from=builder /app/dist ./dist

# 复制服务器文件
COPY server.js ./

# 设置文件权限
RUN chown -R nodeuser:nodejs /app
USER nodeuser

# 暴露应用端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# 启动应用
CMD ["node", "server.js"]