FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production TRUST_PROXY=1
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN chown -R node:node /app
USER node
EXPOSE 3000
# นำเข้าเนื้อหาทั้งหมดจากเว็บ WordPress เดิม + หน้ามาตรฐาน (ITA/PDPA) ครั้งแรกเท่านั้น (ข้ามถ้าเคยทำแล้ว) แล้วเริ่มเซิร์ฟเวอร์
CMD ["sh", "-c", "node scripts/import-wp.mjs seed/bms-wp.json.gz --once; node scripts/add-standard-pages.mjs; exec node server.js"]
