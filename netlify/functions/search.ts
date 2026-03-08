import { Handler } from "@netlify/functions";
import { GoogleGenAI } from "@google/genai";

// Função para tratar preços em formato brasileiro
function parsePrice(raw: any): number {
  if (typeof raw === 'number') return raw;
  if (!raw) return 0;
  
  // Remove "R$" e espaços
  const str = String(raw).replace('R$', '').trim();
  
  if (str.includes(',')) {
    // Brazilian format: 1.234,56 -> remove pontos de milhar, troca vírgula por ponto
    return parseFloat(str.replace(/\./g, '').replace(',', '.'));
  }
  
  // US format or simple number: 1234.56 -> remove pontos e aplica parseFloat direto?
  // Wait, the prompt says: "Se não contém vírgula: remove pontos e aplica parseFloat direto"
  // This seems slightly risky for "1.234" (could be 1234 or 1.234), but I will follow the prompt.
  // Actually, if it's "1234.56", removing dot makes it "123456". That's wrong for US format.
  // But the prompt says: "Se não contém vírgula: remove pontos e aplica parseFloat direto".
  // Example: "1.200" (1200) -> "1200" -> 1200. Correct.
  // Example: "1200" -> "1200" -> 1200. Correct.
  // Example: "12.50" (US) -> "1250" -> 1250. Incorrect.
  // However, most Brazilian sites use comma for decimals. I will follow the prompt logic.
  return parseFloat(str.replace(/\./g, ''));
}

// Função para buscar produtos no Mercado Livre
async function buscar_produto_ml(query: string, limite = 10) {
  try {
    const accessToken = process.env.ML_ACCESS_TOKEN;
    let url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=${limite}`;
    
    const headers: Record<string, string> = {
      'Accept': 'application/json'
    };

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    // console.log removed as requested
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      return {
        offers: [],
        error: response.status === 403 ? 'forbidden' : 'error'
      };
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return { offers: [], error: null };
    }

    return {
      offers: data.results.map((item: any) => ({
        id: item.id,
        productName: item.title,
        price: item.price,
        deliveryDays: item.shipping?.logistic_type === 'fulfillment' ? 1 : 3,
        seller: item.seller?.nickname || 'Vendedor ML',
        site: 'Mercado Livre',
        imageUrl: item.thumbnail ? item.thumbnail.replace("-I.jpg", "-O.jpg") : `https://picsum.photos/seed/${item.id}/200/200`,
        link: item.permalink,
        confidence: 0.95,
        isBestPrice: false,
        isFastest: item.shipping?.logistic_type === 'fulfillment',
        condition: item.condition === 'new' ? 'Novo' : 'Usado',
        freeShipping: item.shipping?.free_shipping || false,
        soldQuantity: item.sold_quantity || 0
      })),
      error: null
    };
  } catch (error) {
    return { offers: [], error: 'fatal' };
  }
}

// Função para buscar produtos via Serper.dev (Google Shopping)
async function buscar_produto_serper(query: string, limite = 10) {
  try {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
      return [];
    }

    const response = await fetch("https://google.serper.dev/shopping", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        q: query,
        gl: "br",
        hl: "pt-br"
      })
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const results = data.shopping || [];

    return results.slice(0, limite).map((item: any, index: number) => {
      // Usando parsePrice corrigida
      const price = parsePrice(item.price);

      return {
        id: `serper-${index}-${Date.now()}`,
        productName: item.title,
        price: price,
        deliveryDays: item.delivery?.includes("amanhã") ? 1 : 5,
        seller: item.source || 'Loja Online',
        site: 'Google Shopping',
        imageUrl: item.thumbnail || `https://picsum.photos/seed/${index}-${Date.now()}/200/200`,
        link: item.link,
        confidence: 0.85,
        isBestPrice: false,
        isFastest: item.delivery?.includes("amanhã") || false,
        condition: 'Novo',
        freeShipping: item.delivery?.toLowerCase().includes("grátis") || false,
        soldQuantity: 0
      };
    });
  } catch (error) {
    return [];
  }
}

// Helper para retry com exponential backoff
const generateContentWithRetry = async (ai: GoogleGenAI, params: any, retries = 3, delay = 1000): Promise<any> => {
  try {
    return await ai.models.generateContent(params);
  } catch (error: any) {
    const isRateLimit = error.status === 429 || (error.message && error.message.includes("429"));
    const isServiceUnavailable = error.status === 503 || (error.message && error.message.includes("503"));

    if (retries > 0 && (isRateLimit || isServiceUnavailable)) {
      let retryDelay = delay;
      if (isRateLimit) {
        const match = error.message.match(/Please retry in (\d+\.?\d*)s/);
        if (match) {
          retryDelay = Math.ceil(parseFloat(match[1]) * 1000) + 1000;
        }
      }
      
      // Cap delay at 10 seconds to avoid function timeout
      retryDelay = Math.min(retryDelay, 10000);

      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return generateContentWithRetry(ai, params, retries - 1, delay * 2);
    }
    throw error;
  }
};

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { query } = JSON.parse(event.body || "{}");

  if (!query) {
    return { statusCode: 400, body: JSON.stringify({ error: "Query is required" }) };
  }

  try {
    const apiKey = process.env.MY_API_KEY || process.env.GEMINI_API_KEY;
    
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: "Chave de API não configurada corretamente. Adicione 'MY_API_KEY' nos Secrets." }) 
      };
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = "gemini-2.0-flash"; // Usando gemini-2.0-flash conforme solicitado

    // Passo 1: Usar IA apenas para normalizar a lista de itens do usuário
    const parsePrompt = `
      Analise a seguinte lista de compras: "${query}".
      Extraia cada item individualmente e retorne um JSON com a seguinte estrutura:
      {
        "items": [
          {
            "id": "string único",
            "originalText": "texto original do item",
            "normalizedName": "nome limpo do produto para busca no Mercado Livre (ex: 'Rolamento SKF 6205')",
            "quantity": number | null,
            "specifications": "especificações técnicas adicionais (medida, marca, voltagem) ou string vazia se não houver"
          }
        ]
      }
      Retorne APENAS o JSON.
    `;

    const parseResponse = await generateContentWithRetry(ai, {
      model: model,
      contents: [{ role: 'user', parts: [{ text: parsePrompt }] }],
      config: { responseMimeType: "application/json" }
    });

    const parsedData = JSON.parse(parseResponse.text || '{"items":[]}');
    const items = parsedData.items || [];

    // Passo 2: Para cada item, buscar no Mercado Livre e Serper
    const finalItems = await Promise.all(items.map(async (item: any) => {
      // Tenta buscar com nome normalizado + especificações
      let searchQuery = `${item.normalizedName} ${item.specifications || ''}`.trim();
      
      // Executa buscas em paralelo
      const [mlResult, serperOffers] = await Promise.all([
        buscar_produto_ml(searchQuery),
        buscar_produto_serper(searchQuery)
      ]);

      let offers = [...mlResult.offers, ...serperOffers];
      let mlError = mlResult.error;
      
      // Se não encontrar nada, tenta buscar apenas com o nome normalizado
      if (offers.length === 0 && item.specifications) {
        const [mlFallback, serperFallback] = await Promise.all([
          buscar_produto_ml(item.normalizedName),
          buscar_produto_serper(item.normalizedName)
        ]);
        offers = [...mlFallback.offers, ...serperFallback];
        mlError = mlFallback.error;
      }
      
      // Marcar o melhor preço
      if (offers.length > 0) {
        const minPrice = Math.min(...offers.map((o: any) => o.price));
        offers.forEach((o: any) => {
          if (o.price === minPrice) o.isBestPrice = true;
        });
      }

      return {
        ...item,
        status: offers.length > 0 ? "ok" : (mlError === 'forbidden' ? 'forbidden' : 'incomplete'),
        offers: offers
      };
    }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: {
          totalItems: finalItems.length,
          analysisStatus: "complete"
        },
        items: finalItems
      })
    };

  } catch (error: any) {
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: error.message || "Erro interno ao processar busca." }) 
    };
  }
};
