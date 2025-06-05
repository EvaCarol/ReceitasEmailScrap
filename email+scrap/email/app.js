require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const nodemailer = require('nodemailer');
const fs = require('fs').promises;

puppeteer.use(StealthPlugin());

const url = 'https://tasty.co';

async function fetchReceitas() {
  const browser = await puppeteer.launch({ headless: false }); // Non-headless para depuração inicial
  const page = await browser.newPage();

  // Configurar user-agent para simular um navegador real
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

  // Acessar a página
  try {
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  } catch (error) {
    console.error('Erro ao acessar a página:', error.message);
    await browser.close();
    return [];
  }

  // Espera adicional para conteúdo dinâmico
  await new Promise(resolve => setTimeout(resolve, 20000));

  // Salvar captura de tela para depuração
  await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });
  console.log('Captura de tela salva em debug-screenshot.png');

  // Tentar seletor principal
  let selector = 'a.feed-item__link';
  try {
    await page.waitForSelector(selector, { timeout: 20000 });
  } catch (error) {
    console.error('Seletor principal não encontrado:', error.message);
    // Tentar seletor genérico como fallback
    selector = 'a[href*="/recipe/"]';
    try {
      await page.waitForSelector(selector, { timeout: 10000 });
      console.log('Fallback para seletor genérico:', selector);
    } catch (fallbackError) {
      console.error('Seletor genérico não encontrado:', fallbackError.message);
      // Salvar HTML para depuração
      const html = await page.content();
      await fs.writeFile('debug.html', html);
      console.log('HTML da página salvo em debug.html para análise.');
      await browser.close();
      return [];
    }
  }

  const receitas = await page.evaluate((selector) => {
    const cards = document.querySelectorAll(selector);
    console.log('Número de cards encontrados:', cards.length);
    const lista = [];

    for (let i = 0; i < cards.length && lista.length < 3; i++) {
      const el = cards[i];
      const titulo = el.querySelector('h3, span, .feed-item__title, .recipe-title')?.innerText?.trim();
      const imagem = el.querySelector('img')?.src || el.querySelector('picture img')?.src;
      const link = el.href;

      if (titulo && imagem && link && link.includes('/recipe/')) {
        lista.push({ titulo, imagem, link });
      }
    }

    return lista;
  }, selector);

  await browser.close();
  return receitas;
}

async function sendEmail(receitas) {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const htmlContent = `
    <div style="font-family: sans-serif;">
      <h2 style="text-align: center;">🍰 Receitas do Dia</h2>
      ${receitas.map(r => `
        <div style="border: 1px solid #ddd; margin-bottom: 15px; padding: 10px; border-radius: 8px;">
          <h3>${r.titulo}</h3>
          <img src="${r.imagem}" alt="Imagem da receita" style="width: 100%; max-width: 400px; border-radius: 8px;" />
          <p><a href="${r.link}" target="_blank">Ver receita completa</a></p>
        </div>
      `).join('')}
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: `"Receitas da Evellyn" <${process.env.EMAIL_USER}>`,
      to: 'evellyncarolyne12@gmail.com',
      subject: 'Receitas deliciosas para você! 🍽️',
      html: htmlContent,
    });

    console.log('✅ Email enviado com sucesso:', info.messageId);
  } catch (err) {
    console.error('Erro ao enviar e-mail:', err);
    throw err; // Lança erro para depuração
  }
}

async function executarProjeto() {
  const receitas = await fetchReceitas();
  if (receitas && receitas.length > 0) {
    await sendEmail(receitas);
  } else {
    console.log('❌ Nenhuma receita encontrada.');
  }
}

executarProjeto().catch(err => console.error('Erro na execução:', err));