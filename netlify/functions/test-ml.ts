import { Handler } from "@netlify/functions";

export const handler: Handler = async () => {
  try {
    const accessToken = process.env.ML_ACCESS_TOKEN;
    const url = "https://api.mercadolibre.com/sites/MLB/search?q=rolamento&limit=3";
    
    const headers: Record<string, string> = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      return {
        statusCode: 200, // Returning 200 to show error in body as per prompt structure implying a JSON response
        body: JSON.stringify({ 
          status: "error", 
          httpStatus: response.status, 
          error: response.status === 403 ? "forbidden" : "error" 
        })
      };
    }

    const data = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        status: "ok", 
        count: data.results?.length, 
        sample: data.results?.[0]?.title 
      })
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ status: "error", message: err.message })
    };
  }
};
