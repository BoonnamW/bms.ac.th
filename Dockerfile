FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production TRUST_PROXY=1
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN chown -R node:node /app
EXPOSE 3000
# เริ่มด้วย root เพื่อให้สิทธิ์ดิสก์ถาวร (DATA_PATH) แก่ผู้ใช้ node แล้วรันเว็บด้วยสิทธิ์ node — ดู scripts/start.mjs
# (นำเข้าเนื้อหาจากเว็บ WordPress เดิม + หน้ามาตรฐาน ITA/PDPA ครั้งแรกเท่านั้น แล้วเริ่มเซิร์ฟเวอร์)
CMD ["node", "scripts/start.mjs"]
