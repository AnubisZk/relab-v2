# RE Optimization Lab v2.0
**ZSK Solutions** · Renewable Energy Mathematical Optimization Dashboard

🔗 Live: [relab.zsksolutions.net.tr](https://relab.zsksolutions.net.tr)

## Dosya Yapısı

```
relab-netlify/
├── index.html          ← Dashboard shell + CSS
├── physicsEngine.js    ← Tüm fizik denklemleri (Solar/Wind/Offshore/Battery)
├── optimizer.js        ← Grid Search ~312,000 kombinasyon
├── app.js              ← Orchestrator + Plotly grafikler + Canvas scene
├── mockData.js         ← Default senaryo + World Model mock
├── netlify.toml        ← Netlify deploy config
└── README.md
```

## Fizik Modeller

| Model | Formül |
|-------|--------|
| Solar | `E_net = A·G·η·t · cos(θ) · C_f · (1−Ls) · (1−Lt)` |
| Wind  | `P = ½·ρ·πr²·v³·Cp · cos³(γ) · (1−Lw)` |
| Offshore | `R_sea = 0.4·Hs + 0.15·Tp + 0.25·v + 0.20·δ` |
| Battery | `B_next = B + ηc·Ein − Eout/ηd` |
| Objective | `Z = ΣE_net + B_avail − ΣC_total` |

## Netlify Deploy

1. GitHub'a push et
2. Netlify → "Import from GitHub" → bu repo
3. Build command: *(boş)*
4. Publish directory: `.`
5. Deploy!

## Geliştirme Yol Haritası

- [x] Physics Engine (5 model, 9 kısıt)
- [x] Grid Search Optimizer (~312k kombinasyon)
- [x] Plotly Dashboard (6 interaktif grafik)
- [x] World Model mock panel
- [ ] Python FastAPI backend (Railway)
- [ ] Gerçek World Model / surrogate ML
- [ ] Unity/VR WebView entegrasyonu
- [ ] Senaryo kaydetme (Supabase/D1)
