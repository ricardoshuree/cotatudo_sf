import { GoogleGenAI } from "@google/genai";

// Função para buscar produtos no Mercado Livre
export async function buscar_produto_ml(query: string, limite = 10) {
  try {
    const accessToken = process.env.ML_ACCESS_TOKEN;
    let url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=${limite}`;
    
    const headers: Record<string, string> = {
      'Accept': 'application/json'
    };

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    console.log(`[ML API] Chamando URL: ${url} ${accessToken ? '(Com Token)' : '(Sem Token)'}`);
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ML API] Erro na resposta: ${response.status} - ${errorText}`);
      
      return {
        offers: [],
        error: response.status === 403 ? 'forbidden' : 'error'
      };
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      console.log(`[ML API] Nenhum resultado para: "${query}"`);
      return { offers: [], error: null };
    }

    console.log(`[ML API] Sucesso: ${data.results.length} itens encontrados para "${query}"`);

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
    console.error(`[ML API] Erro fatal ao buscar "${query}":`, error);
    return { offers: [], error: 'fatal' };
  }
}

// Função para buscar produtos via Serper.dev (Google Shopping)
export async function buscar_produto_serper(query: string, limite = 10) {
  try {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
      console.warn("[Serper API] Chave SERPER_API_KEY não configurada.");
      return [];
    }

    console.log(`[Serper API] Buscando: "${query}"`);
    
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
      const errorText = await response.text();
      console.error(`[Serper API] Erro: ${response.status} - ${errorText}`);
      return [];
    }

    const data = await response.json();
    const results = data.shopping || [];

    console.log(`[Serper API] Sucesso: ${results.length} itens encontrados para "${query}"`);

    return results.slice(0, limite).map((item: any, index: number) => {
      // Limpar o preço (ex: "R$ 1.200,00" -> 1200)
      let price = 0;
      if (item.price) {
        const priceMatch = item.price.replace(/[^\d,]/g, '').replace(',', '.');
        price = parseFloat(priceMatch) || 0;
      }

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
    console.error(`[Serper API] Erro fatal:`, error);
    return [];
  }
}

// Helper para retry com exponential backoff
export const generateContentWithRetry = async (ai: GoogleGenAI, params: any, retries = 10, delay = 1000): Promise<any> => {
  try {
    return await ai.models.generateContent(params);
  } catch (error: any) {
    // Verifica se é um erro de rate limit (429) ou serviço indisponível (503)
    const isRateLimit = error.status === 429 || (error.message && error.message.includes("429"));
    const isServiceUnavailable = error.status === 503 || (error.message && error.message.includes("503"));

    if (retries > 0 && (isRateLimit || isServiceUnavailable)) {
      // Tenta extrair o retryDelay da mensagem de erro se disponível
      let retryDelay = delay;
      if (isRateLimit) {
        const match = error.message.match(/Please retry in (\d+\.?\d*)s/);
        if (match) {
          retryDelay = parseFloat(match[1]) * 1000;
        }
      }

      console.warn(`[API Utils] Erro ${error.status || 'API'}, tentando novamente em ${retryDelay}ms... (${retries} tentativas restantes)`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return generateContentWithRetry(ai, params, retries - 1, delay * 2);
    }
    throw error;
  }
};
