import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

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
async function buscar_produto_serper(query: string, limite = 10) {
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Test Route for ML API
  app.get("/api/test-ml", async (req, res) => {
    try {
      const result = await buscar_produto_ml("rolamento");
      res.json({ status: "ok", count: result.offers.length, sample: result.offers[0], error: result.error });
    } catch (err: any) {
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // Test Route for Serper API
  app.get("/api/test-serper", async (req, res) => {
    try {
      const results = await buscar_produto_serper("rolamento skf 6205");
      res.json({ status: "ok", count: results.length, sample: results[0] });
    } catch (err: any) {
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // API Route for Search
  app.post("/api/search", async (req, res) => {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    try {
      const apiKey = process.env.MY_API_KEY || process.env.GEMINI_API_KEY;
      
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
        return res.status(500).json({ 
          error: "Chave de API não configurada corretamente. Adicione 'MY_API_KEY' nos Secrets." 
        });
      }

      const ai = new GoogleGenAI({ apiKey });
      const model = "gemini-3-flash-preview";

      // Helper para retry com exponential backoff
      const generateContentWithRetry = async (params: any, retries = 3, delay = 1000): Promise<any> => {
        try {
          return await ai.models.generateContent(params);
        } catch (error: any) {
          if (retries > 0 && error.status === 503) {
            console.warn(`[Backend] Erro 503, tentando novamente em ${delay}ms... (${retries} tentativas restantes)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return generateContentWithRetry(params, retries - 1, delay * 2);
          }
          throw error;
        }
      };

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

      const parseResponse = await generateContentWithRetry({
        model: model,
        contents: [{ role: 'user', parts: [{ text: parsePrompt }] }],
        config: { responseMimeType: "application/json" }
      });

      const parsedData = JSON.parse(parseResponse.text || '{"items":[]}');
      const items = parsedData.items || [];
      console.log(`[Backend] Itens identificados pela IA: ${items.length}`);

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
          console.log(`[Backend] Sem resultados com especificações. Tentando apenas nome: "${item.normalizedName}"`);
          const [mlFallback, serperFallback] = await Promise.all([
            buscar_produto_ml(item.normalizedName),
            buscar_produto_serper(item.normalizedName)
          ]);
          offers = [...mlFallback.offers, ...serperFallback];
          mlError = mlFallback.error;
        }
        
        console.log(`[Backend] Item: ${item.normalizedName} - Total de ofertas: ${offers.length} (ML: ${mlResult.offers.length}, Serper: ${serperOffers.length})`);
        
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

      res.json({
        summary: {
          totalItems: finalItems.length,
          analysisStatus: "complete"
        },
        items: finalItems
      });

    } catch (error: any) {
      console.error("Search Error:", error);
      res.status(500).json({ error: error.message || "Erro interno ao processar busca." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
