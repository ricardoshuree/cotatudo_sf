import { Handler } from "@netlify/functions";

export const handler: Handler = async () => {
  try {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 200,
        body: JSON.stringify({ status: "error", message: "SERPER_API_KEY não configurada." })
      };
    }

    const response = await fetch("https://google.serper.dev/shopping", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        q: "rolamento skf 6205",
        gl: "br",
        hl: "pt-br"
      })
    });

    if (!response.ok) {
      return {
        statusCode: 200,
        body: JSON.stringify({ status: "error", httpStatus: response.status })
      };
    }

    const data = await response.json();
    const results = data.shopping || [];

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        status: "ok", 
        count: results.length, 
        sample: results[0]?.title 
      })
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ status: "error", message: err.message })
    };
  }
};
