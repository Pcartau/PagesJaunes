const prompt = require("prompt-async");

async function getPageUrl() {
  console.log('URL de la recherche Page Jaune. Mettez vous sur la première page de recherche ! Ex: https://www.pagesjaunes.fr/annuaire/chercherlespros?quoiqui=restaurant%20%C3%A0%20emporter&ou=Paris&idOu=L07505600&page=1&contexte=gHJHEY0R3Vwat1cA29bH2QxISMRndNFsTX8Pg%2Byl0iE%3D&proximite=0&carte=0&quoiQuiInterprete=restaurant%20%C3%A0%20emporter');
  let promptRes = await prompt.get(['pageURL']);
  while (!promptRes.pageURL.includes('https://www.pagesjaunes.fr')) {
    console.log('Veuillez essayer avec un url contenant : https://www.pagesjaunes.fr');
    promptRes = await prompt.get(['pageURL']);
  }
  return promptRes.pageURL;
}

async function verifyTermsOfServices(page) {
  console.log("--- Confirmation de la popup 'Terms of Services' ---");
  await page.evaluate(() => document.getElementById('didomi-notice-agree-button').click())
    .catch(() => console.log('Failed trying to agree popup Terms of Services'));
};

async function getNumberOfPagesToScrap(page) {
  const pageNumber = await page.evaluate(() => document.getElementById('SEL-compteur').textContent.split('/')[1]);
  
  console.log(`Il y a ${pageNumber} pages. Indiquez combien vous voulez en récupérer`);

  let numberAsked = await prompt.get(['Pages à récupérer']);
  while (+numberAsked['Pages à récupérer'] <= 0 || isNaN(+numberAsked['Pages à récupérer'])) {
    console.log('Veuillez rentrer un chiffre exact');
    numberAsked = await prompt.get(['Pages à récupérer']);
  }
  return numberAsked;
};

async function getPagesInformations(businesses, page, numberAsked) {
  console.log("--- Récupération des informations ---");

  let pageToScrap = +numberAsked['Pages à récupérer'];
  let currentPage = 1;
  while (currentPage <= pageToScrap) {
    // Indicate Page
    console.log(await page.evaluate((pageToScrap) => document.getElementById('SEL-compteur').textContent.split('/')[0] + ` / ${pageToScrap}`, pageToScrap));
    
    businesses = await page.evaluate(async (businesses) => {
      Object.values(document.getElementsByClassName('bi-bloc blocs')).forEach(async (business) => {
        const title = document.querySelector(`#${business.id} > div > header > div > div > h3 > a.denomination-links.pj-link`).textContent;
        const address = document.querySelector(`#${business.id} > div > header > div > div > a`).textContent;
        let prestations = document.querySelector(`#bi-desc-${business.id.split('-')[2].split(' ')[0]} > div.zone-cvi-cviv > p.cviv.cris`);
        let telContent = document.querySelector(`#${business.id} > div > footer > ul.main-contact-container > li > div`).children;
        let tel = '';
        let website = '';
        if (telContent) {
          Object.values(telContent).forEach((div) => {
            tel += div.textContent;
          });
        } else {
          tel = ' ';
        }
        prestations === null && ( prestations = ' ' );        
        try {
          website = JSON.parse(document.querySelector(
            `#bi-contact-${business.id.split('-')[2].split(' ')[0]} > ul.barre-liens-contact > li.item.hidden-phone.site-internet.SEL-internet > a`
          ).getAttribute('data-pjlb'));
          website = atob(website.url);
        }
        catch {
          const websites = document.querySelector(`#bi-sites-internet-${business.id.split('-')[2].split(' ')[0]}`);
          if (websites === null) {
            website = ' ';
          } else {
            Object.values(websites.children).forEach((_website) => {
              website += '\n' + atob(JSON.parse(_website.children[0].getAttribute('data-pjlb')).url);
            });
          }
        }

        businesses.businessList.push({
          Nom: title.replace(/[\n]/g, ' '),
          Adresse: address.replace(/[\n]/g, ' '),
          Prestations: prestations !== ' ' && prestations.textContent.replace(/[\n]/g, ' ') || ' ',
          Tel: tel !== ' ' && tel.replace(/[\n]/g, ' ') || ' ',
          Website: website.replace(/[\n]/g, ' '),
        });
      });

      try {
        businesses.pageUrl = `https://www.pagesjaunes.fr` + atob(JSON.parse(document.getElementsByClassName('link_pagination next pj-lb pj-link')[0].getAttribute('data-pjlb')).url);
      } catch {
        businesses.pageUrl = `https://www.pagesjaunes.fr`;
      }
      return businesses;
    }, businesses);

    await page.goto(businesses.pageUrl);
    currentPage += 1;
  }
  return businesses;
};

async function getCompanyBossName(businesses, page) {
  console.log("Souhaitez vous récupérer le nom des gérants des établissements trouvés ? *** LONG ! ***");
  console.log("(Laissez vide si vous ne voulez pas )");
  const { confirm }  = await prompt.get(['confirm']);

  if (confirm.length) {
    console.log("--- Récupération des informations sur la société ---");
  
    for (let business of businesses.businessList) {
      console.log(`- ${business.Nom}`);
  
      await page.goto(`https://www.societe.com/cgi-bin/search?champs=${business.Nom.trim().replace(/ /g, '+')}`);
      business.link = await page.evaluate(async (business) => {
        const divs = Object.values(document.querySelector('div#search').children);
        for (let child of divs) {
          if (child.className === 'Card frame') {
            const _childs = Object.values(child.children);
            for (let _child of _childs) {
              if (_child.className === 'txt-no-underline') {
                const departement = business.Adresse.split(', ')[1];
                if (_child.textContent.replace(/\n/g, '').includes(departement)) {
                  return ('https://www.societe.com' + _child.getAttribute('href'));
                }
              }
            }
          }
        }
        return null;
      }, business);
    }
  
    console.log("--- Finalisation... ---");
    for (let business of businesses.businessList) {
      if (business.link === null) {
        delete business.link;
        business.boss = ' ';
        continue;
      }

      await page.goto(business.link);
      const boss = await page.evaluate(() => {
        try {
          const content = document.querySelector('#tabledir > div > table > tbody > tr').textContent.replaceAll('\n', '').replaceAll('\t', ' ').replace('En savoir plus', '');
          return Array.from(new Set(content.split(' '))).toString(' ').replaceAll(',', ' ');
        }
        catch {
          return ' ';
        }
      });
      delete business.link;
      business.boss = boss;
    }
  }
  return businesses;
}

module.exports = { verifyTermsOfServices, getNumberOfPagesToScrap, getPagesInformations, getCompanyBossName, getPageUrl};