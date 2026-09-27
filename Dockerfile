FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production TRUST_PROXY=1
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN chown -R node:node /app
USER node
EXPOSE 3000
# นำเข้าข้อมูลโรงเรียน + หน้ามาตรฐาน (ITA/PDPA) ครั้งแรกเท่านั้น (ข้ามถ้าเคยทำแล้ว) แล้วเริ่มเซิร์ฟเวอร์
CMD ["sh", "-c", "timeout 60 node scripts/import-bms.mjs --once; node scripts/add-standard-pages.mjs; exec node server.js"]
