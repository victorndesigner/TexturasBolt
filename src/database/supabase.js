const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabase;

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ AVISO: SUPABASE_URL ou SUPABASE_KEY não configurados no .env! O banco de dados não funcionará corretamente.');
    // Criamos um proxy que loga o erro ao ser acessado, evitando o crash no boot mas avisando no uso
    supabase = new Proxy({}, {
        get: (target, prop) => {
            return () => {
                console.error(`❌ ERRO: Tentativa de usar Supabase (${prop}) sem chaves configuradas.`);
                return { data: null, error: new Error("Supabase keys are missing") };
            };
        }
    });
} else {
    supabase = createClient(supabaseUrl, supabaseKey);
}

module.exports = supabase;
