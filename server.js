const express=require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());



// 1. STATİK DOSYA VE ANA SAYFA

// index.html ve diğer dosyaları (css, js) sunmak için:
app.use(express.static(__dirname));



// 2. API BÖLÜMÜ
// 
const YURT_URL = 'https://kykyemek.com/Menu/TodayMenu/';
const OKUL_BASE_URL = 'https://sks.yildiz.edu.tr/api/food-menu?type=student_food_menu&sort_by=date_asc&list_date=';

app.get('/api/menuler', async (req, res) => {
    try {
        const bugun = new Date();
        const yil = bugun.getFullYear();
        const ayRaw = bugun.getMonth() + 1;
        const gunRaw = bugun.getDate();

        const ay = String(ayRaw).padStart(2, '0');
        const gun = String(gunRaw).padStart(2, '0');
        
        // Okul API'si YYYYMM formatı istiyor (örn: 202512)
        const apiTarihParametresi = `${yil}${ay}`; 
        // Okul listesinden arama yaparken DD-MM-YYYY formatı lazım (örn: 06-12-2025)
        const aranacakTarihFormat = `${gun}-${ay}-${yil}`;
        // 5 aralık gecekodunda 00.23 dakikasında kod hazırdı.
        // o yuzden calisiyor mu kontrol edemedigim icin alttaki kod satiriyle denedim:
        // const aranacakTarihFormat = '05-12-2025';

        console.log(`🔎 ISTEK geldi. Tarih: ${aranacakTarihFormat}`);

        // --- YURT VERISI (PUPPETEER) ---
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        
        // Hata almamak icin try-catch bloguna alıyoruz
        let yurtVerisi = { tarihText: "", kahvalti: [], aksam: [] };
        try {
            await page.goto(YURT_URL, { waitUntil: 'networkidle2' });
            try { await page.waitForSelector('#areaone_1', { timeout: 3000 }); } catch(e) {}

            yurtVerisi = await page.evaluate(() => {
                const tarih = document.querySelector('#date_1')?.innerText.trim() || "";
                const getFood = (id) => {
                    const list = [];
                    const div = document.getElementById(id);
                    if(div) {
                        div.querySelectorAll('p.fw-bold').forEach(p => {
                            const text = p.innerText.trim();
                            if(text && !text.includes('kalori') && !text.includes('Su') && !text.includes('Ekmek')) {
                                list.push(text);
                            }
                        });
                    }
                    return list;
                };
                return {
                    tarihText: tarih,
                    kahvalti: getFood('areaone_0'),
                    aksam: getFood('areaone_1')
                };
            });
        } catch (error) {
            console.log("[nok] Yurt verisi cekilirken hata:", error.message);
        }
        await browser.close();

        // --- OKUL VERİSİ (AXIOS & CHEERIO) ---
        let okulOgle = ["Menü Yok"];
        let okulAksam = ["Menü Yok"];

        try {
            const tamOkulUrl = `${OKUL_BASE_URL}${apiTarihParametresi}`;
            const okulResponse = await axios.get(tamOkulUrl);
            const tumListe = okulResponse.data; 

            // Aradiigmiz gunu listede bul
            const bulunanGun = tumListe.find(item => item.date === aranacakTarihFormat);
            
            if (bulunanGun) {
                // HTML string'i listeye çeviren yardımcı fonksiyon
                const htmlToList = (htmlString) => {
                    if (!htmlString) return [];
                    const $ = cheerio.load(htmlString); 
                    const yemekler = [];
                    $('p').each((i, el) => {
                        const yemekIsmi = $(el).text().trim();
                        if(yemekIsmi) yemekler.push(yemekIsmi);
                    });
                    return yemekler;
                };

                if (bulunanGun.lunch_menu) okulOgle = htmlToList(bulunanGun.lunch_menu);
                if (bulunanGun.dinner_menu) okulAksam = htmlToList(bulunanGun.dinner_menu);
            }
        } catch (error) {
            console.log("[nok] Okul verisi cekilirken hata:", error.message);
        }

        // SONUÇ DÖNDÜR
        res.json({
            tarih: yurtVerisi.tarihText || aranacakTarihFormat,
            yurt: { kahvalti: yurtVerisi.kahvalti, aksam: yurtVerisi.aksam },
            okul: { ogle: okulOgle, aksam: okulAksam }
        });

    } catch (error) {
        console.error("[nok] GENEL HATA:", error.message);
        res.status(500).json({ error: error.message });
    }
});



// 3. SERVER BAŞLAT
const PORT = process.env.PORT || 3000;
app.listen(3000, () => {
    console.log(`[ok] Server Baslatildi: Port ${PORT}`);
});