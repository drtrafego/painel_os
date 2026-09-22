// Knowledge Atlas — AI concept graph dataset.
// 81 concepts across 7 clusters, with directed prerequisite edges.

export type ClusterId =
  | "math"
  | "ml"
  | "dl"
  | "llm"
  | "sys"
  | "align"
  | "app";

export interface Cluster {
  id: ClusterId;
  name: string;
  color: string; // hex
  order: number;
}

export interface AtlasNode {
  id: string;
  label: string;
  cluster: ClusterId;
  blurb: string;
  year: number; // approximate year the concept became prominent
}

export interface AtlasEdge {
  from: string;
  to: string; // prerequisite direction: from -> to means "from is prerequisite of to"
}

export const CLUSTERS: Cluster[] = [
  { id: "math", name: "Mathematical Foundations", color: "#4a5fd8", order: 0 },
  { id: "ml", name: "Classical Machine Learning", color: "#0e8fbe", order: 1 },
  { id: "dl", name: "Deep Learning", color: "#0f9c68", order: 2 },
  { id: "llm", name: "Large Models", color: "#8f45dd", order: 3 },
  { id: "sys", name: "Systems and Compute", color: "#c47a06", order: 4 },
  { id: "align", name: "Alignment and Safety", color: "#d92066", order: 5 },
  { id: "app", name: "Applications", color: "#6f9412", order: 6 },
];

export const NODES: AtlasNode[] = [
  // ── Mathematical Foundations (8) ────────────────────────────────────────
  { id: "linalg", label: "Linear Algebra", cluster: "math", year: 1900, blurb: "Vectors, matrices, eigenvalues — the language of every model that operates on tensors." },
  { id: "calc", label: "Calculus", cluster: "math", year: 1700, blurb: "Gradients, partial derivatives, and the chain rule underpin all gradient-based learning." },
  { id: "prob", label: "Probability", cluster: "math", year: 1700, blurb: "Distributions, Bayes' rule, and expectation — how we reason about uncertainty." },
  { id: "stats", label: "Statistics", cluster: "math", year: 1900, blurb: "Estimation, hypothesis testing, and bias/variance tradeoffs." },
  { id: "opt", label: "Optimization", cluster: "math", year: 1950, blurb: "Convex and non-convex methods: SGD, momentum, Adam, second-order tricks." },
  { id: "info", label: "Information Theory", cluster: "math", year: 1948, blurb: "Entropy, cross-entropy, KL divergence — the loss functions of language models." },
  { id: "disc", label: "Discrete Math", cluster: "math", year: 1900, blurb: "Graphs, combinatorics, and logic behind search, sampling, and tokenization." },
  { id: "numer", label: "Numerical Methods", cluster: "math", year: 1950, blurb: "Floating-point stability, conditioning, and the engineering of trainable deep nets." },

  // ── Classical Machine Learning (10) ────────────────────────────────────
  { id: "supervised", label: "Supervised Learning", cluster: "ml", year: 1960, blurb: "Learning a mapping from labeled (x, y) pairs." },
  { id: "unsupervised", label: "Unsupervised Learning", cluster: "ml", year: 1960, blurb: "Finding structure in unlabeled data: clustering and density." },
  { id: "regression", label: "Regression", cluster: "ml", year: 1805, blurb: "Predicting continuous targets — least squares to generalized linear models." },
  { id: "classification", label: "Classification", cluster: "ml", year: 1960, blurb: "Assigning discrete labels — from logistic regression to ensembles." },
  { id: "trees", label: "Decision Trees", cluster: "ml", year: 1984, blurb: "Recursive partitioning of feature space; interpretable rule learners." },
  { id: "forests", label: "Random Forests", cluster: "ml", year: 2001, blurb: "Bagged, randomized trees — robust non-linear baselines." },
  { id: "svm", label: "Support Vector Machines", cluster: "ml", year: 1995, blurb: "Maximum-margin classifiers with the kernel trick." },
  { id: "kmeans", label: "k-Means", cluster: "ml", year: 1967, blurb: "Iterative centroid assignment — the canonical clustering algorithm." },
  { id: "pca", label: "PCA", cluster: "ml", year: 1901, blurb: "Principal component analysis — linear dimensionality reduction via eigendecomposition." },
  { id: "gradDesc", label: "Gradient Descent", cluster: "ml", year: 1847, blurb: "Iteratively moving parameters against the gradient of the loss." },

  // ── Deep Learning (14) ─────────────────────────────────────────────────
  { id: "nn", label: "Neural Networks", cluster: "dl", year: 1958, blurb: "Stacked differentiable layers — universal approximators trained by gradient descent." },
  { id: "backprop", label: "Backpropagation", cluster: "dl", year: 1986, blurb: "Reverse-mode autodiff to train multi-layer networks." },
  { id: "act", label: "Activation Functions", cluster: "dl", year: 1980, blurb: "ReLU, GELU, SwiGLU — the non-linearities between linear transforms." },
  { id: "cnn", label: "Convolutional Networks", cluster: "dl", year: 1989, blurb: "Weight-shared local filters that exploit spatial structure in images." },
  { id: "rnn", label: "Recurrent Networks", cluster: "dl", year: 1986, blurb: "Hidden state carried across time for sequence modeling." },
  { id: "lstm", label: "LSTM", cluster: "dl", year: 1997, blurb: "Gated cells that mitigate vanishing gradients in long sequences." },
  { id: "transformer", label: "Transformers", cluster: "dl", year: 2017, blurb: "Attention-only architecture that parallelizes sequence learning." },
  { id: "attention", label: "Attention", cluster: "dl", year: 2014, blurb: "Soft retrieval over a context — the core mechanism of modern sequence models." },
  { id: "embed", label: "Embeddings", cluster: "dl", year: 2013, blurb: "Dense vector representations of discrete tokens, words, or entities." },
  { id: "batchnorm", label: "Batch Normalization", cluster: "dl", year: 2015, blurb: "Normalizing activations per mini-batch to stabilize deep training." },
  { id: "dropout", label: "Dropout", cluster: "dl", year: 2014, blurb: "Stochastic unit masking as an explicit regularizer." },
  { id: "autoencoder", label: "Autoencoders", cluster: "dl", year: 2006, blurb: "Bottleneck networks that learn compressed latent codes." },
  { id: "gan", label: "GANs", cluster: "dl", year: 2014, blurb: "Adversarial generator/discriminator training for sharp generative samples." },
  { id: "diffusion", label: "Diffusion Models", cluster: "dl", year: 2020, blurb: "Iterative denoising that yields state-of-the-art image and video synthesis." },

  // ── Large Models (17) ──────────────────────────────────────────────────
  { id: "pretrain", label: "Pretraining", cluster: "llm", year: 2018, blurb: "Self-supervised training on web-scale corpora before task adaptation." },
  { id: "finetune", label: "Fine-tuning", cluster: "llm", year: 2018, blurb: "Updating a pretrained model on a narrower labeled dataset." },
  { id: "rlhf", label: "RLHF", cluster: "llm", year: 2017, blurb: "Reinforcement Learning from Human Feedback — aligning models to preferences." },
  { id: "prompt", label: "Prompt Engineering", cluster: "llm", year: 2020, blurb: "Crafting instructions and context to steer frozen models." },
  { id: "icl", label: "In-context Learning", cluster: "llm", year: 2020, blurb: "Few-shot adaptation purely through conditioning examples in the prompt." },
  { id: "cot", label: "Chain-of-Thought", cluster: "llm", year: 2022, blurb: "Prompting the model to externalize intermediate reasoning steps." },
  { id: "rag", label: "Retrieval Augmentation", cluster: "llm", year: 2020, blurb: "Grounding generation by injecting retrieved documents at inference." },
  { id: "lora", label: "LoRA", cluster: "llm", year: 2021, blurb: "Low-rank adapter matrices for parameter-efficient fine-tuning." },
  { id: "quant", label: "Quantization", cluster: "llm", year: 2022, blurb: "Reducing weight precision (INT8, INT4) to shrink and accelerate models." },
  { id: "distill", label: "Distillation", cluster: "llm", year: 2015, blurb: "Training a smaller student to match a larger teacher's outputs." },
  { id: "moe", label: "Mixture of Experts", cluster: "llm", year: 2017, blurb: "Sparse expert routing that scales parameters without proportional FLOPs." },
  { id: "multimodal", label: "Multimodal Models", cluster: "llm", year: 2021, blurb: "Joint modeling of text, image, audio, and video in one network." },
  { id: "vlm", label: "Vision-Language Models", cluster: "llm", year: 2023, blurb: "Models that reason over images and text together (e.g. Florence, GPT-4V)." },
  { id: "instruct", label: "Instruction Tuning", cluster: "llm", year: 2022, blurb: "Supervised tuning on (instruction, response) pairs to follow commands." },
  { id: "align", label: "Alignment", cluster: "llm", year: 2022, blurb: "Shaping models to be helpful, honest, and harmless." },
  { id: "constai", label: "Constitutional AI", cluster: "llm", year: 2022, blurb: "Self-critique against a constitution to reduce the need for human labels." },
  { id: "tooluse", label: "Tool Use", cluster: "llm", year: 2023, blurb: "Teaching models to call functions, APIs, and code interpreters." },

  // ── Systems and Compute (16) ───────────────────────────────────────────
  { id: "gpu", label: "GPUs", cluster: "sys", year: 1999, blurb: "Massively parallel accelerators that dominate deep learning compute." },
  { id: "tpu", label: "TPUs", cluster: "sys", year: 2016, blurb: "Domain-specific tensor processors optimized for matrix math at scale." },
  { id: "disttrain", label: "Distributed Training", cluster: "sys", year: 2012, blurb: "Coordinating many workers to train models too large for one device." },
  { id: "dataparallel", label: "Data Parallelism", cluster: "sys", year: 2012, blurb: "Each worker holds a full model copy; gradients are averaged." },
  { id: "modelparallel", label: "Model Parallelism", cluster: "sys", year: 2019, blurb: "Splitting a single model's layers or tensors across devices." },
  { id: "pipeline", label: "Pipeline Parallelism", cluster: "sys", year: 2019, blurb: "Micro-batching across device-staged layers to overlap compute and transfer." },
  { id: "cuda", label: "CUDA", cluster: "sys", year: 2007, blurb: "NVIDIA's parallel computing platform and the lingua franca of ML kernels." },
  { id: "vram", label: "vRAM Management", cluster: "sys", year: 2018, blurb: "Activation checkpointing, offloading, and memory budgets for big models." },
  { id: "kvcache", label: "KV Cache", cluster: "sys", year: 2020, blurb: "Caching attention keys/values across steps to avoid recomputation." },
  { id: "attnopt", label: "Attention Optimization", cluster: "sys", year: 2022, blurb: "Sparse, linear, and approximate attention to tame the quadratic cost." },
  { id: "flashattn", label: "Flash Attention", cluster: "sys", year: 2022, blurb: "IO-aware exact attention that fuses kernels for big speedups." },
  { id: "serving", label: "Model Serving", cluster: "sys", year: 2018, blurb: "Hosting, batching, and routing inference requests in production." },
  { id: "batching", label: "Continuous Batching", cluster: "sys", year: 2022, blurb: "Dynamic per-step batching of requests to maximize throughput." },
  { id: "quantinf", label: "Quantized Inference", cluster: "sys", year: 2022, blurb: "Running INT8/INT4/FP8 math to cut latency and cost." },
  { id: "infeng", label: "Inference Engines", cluster: "sys", year: 2023, blurb: "vLLM, TensorRT-LLM, and TGI — specialized runtimes for LLM serving." },
  { id: "vectordb", label: "Vector Databases", cluster: "sys", year: 2021, blurb: "Approximate nearest-neighbor stores powering retrieval and RAG." },

  // ── Alignment and Safety (8) ───────────────────────────────────────────
  { id: "reward", label: "Reward Modeling", cluster: "align", year: 2017, blurb: "Learning a scalar preference model from comparisons to drive RLHF." },
  { id: "humanfb", label: "Human Feedback", cluster: "align", year: 2017, blurb: "Collecting rankings and ratings to express what 'good' means." },
  { id: "redteam", label: "Red Teaming", cluster: "align", year: 2022, blurb: "Adversarially probing models to surface failure modes before launch." },
  { id: "bias", label: "Bias Detection", cluster: "align", year: 2018, blurb: "Measuring disparate performance across demographic and topical slices." },
  { id: "toxic", label: "Toxicity Filtering", cluster: "align", year: 2017, blurb: "Classifiers and rule layers that suppress harmful generations." },
  { id: "interp", label: "Interpretability", cluster: "align", year: 2020, blurb: "Probing activations and circuits to explain model behavior." },
  { id: "robust", label: "Robustness", cluster: "align", year: 2019, blurb: "Resilience to distribution shift, adversarial inputs, and prompt injection." },
  { id: "halluc", label: "Hallucination Mitigation", cluster: "align", year: 2023, blurb: "Grounding, attribution, and verification to reduce fabricated outputs." },

  // ── Applications (8) ───────────────────────────────────────────────────
  { id: "chatbot", label: "Chatbots", cluster: "app", year: 2022, blurb: "Conversational assistants built on instruction-tuned LLMs." },
  { id: "codegen", label: "Code Generation", cluster: "app", year: 2021, blurb: "Models that synthesize, complete, and refactor source code." },
  { id: "imggen", label: "Image Generation", cluster: "app", year: 2022, blurb: "Text-to-image products powered by diffusion models." },
  { id: "summary", label: "Summarization", cluster: "app", year: 2019, blurb: "Condensing long documents into faithful abstracts." },
  { id: "translate", label: "Translation", cluster: "app", year: 2016, blurb: "Neural machine translation across hundreds of language pairs." },
  { id: "search", label: "Search", cluster: "app", year: 2023, blurb: "Retrieval and ranking augmented by dense embeddings and LLMs." },
  { id: "agents", label: "Agents", cluster: "app", year: 2023, blurb: "Autonomous LLM loops that plan, act, and reflect with tools." },
  { id: "recsys", label: "Recommendation", cluster: "app", year: 2009, blurb: "Personalized ranking of items using learned embeddings and objectives." },
];

// Directed prerequisite edges: from -> to means "from is a prerequisite of to".
export const EDGES: AtlasEdge[] = [
  // Math -> Math
  { from: "calc", to: "opt" },
  { from: "linalg", to: "pca" },
  { from: "linalg", to: "numer" },
  { from: "prob", to: "info" },
  { from: "prob", to: "stats" },
  { from: "stats", to: "info" },
  { from: "disc", to: "info" },

  // Math -> Classical ML
  { from: "linalg", to: "pca" },
  { from: "linalg", to: "svm" },
  { from: "prob", to: "supervised" },
  { from: "stats", to: "regression" },
  { from: "stats", to: "classification" },
  { from: "opt", to: "gradDesc" },
  { from: "info", to: "trees" },
  { from: "linalg", to: "kmeans" },

  // Classical ML internal
  { from: "supervised", to: "regression" },
  { from: "supervised", to: "classification" },
  { from: "classification", to: "svm" },
  { from: "classification", to: "trees" },
  { from: "trees", to: "forests" },
  { from: "unsupervised", to: "kmeans" },
  { from: "unsupervised", to: "pca" },
  { from: "gradDesc", to: "regression" },

  // Math/DL -> DL
  { from: "linalg", to: "nn" },
  { from: "calc", to: "backprop" },
  { from: "opt", to: "nn" },
  { from: "gradDesc", to: "nn" },
  { from: "nn", to: "backprop" },
  { from: "nn", to: "act" },
  { from: "backprop", to: "cnn" },
  { from: "backprop", to: "rnn" },
  { from: "rnn", to: "lstm" },
  { from: "act", to: "cnn" },
  { from: "cnn", to: "autoencoder" },
  { from: "nn", to: "autoencoder" },
  { from: "autoencoder", to: "gan" },
  { from: "backprop", to: "gan" },
  { from: "act", to: "dropout" },
  { from: "nn", to: "batchnorm" },
  { from: "embed", to: "attention" },
  { from: "attention", to: "transformer" },
  { from: "rnn", to: "attention" },
  { from: "transformer", to: "diffusion" },
  { from: "autoencoder", to: "diffusion" },
  { from: "embed", to: "transformer" },

  // DL -> Large Models
  { from: "transformer", to: "pretrain" },
  { from: "pretrain", to: "finetune" },
  { from: "finetune", to: "instruct" },
  { from: "instruct", to: "align" },
  { from: "align", to: "rlhf" },
  { from: "rlhf", to: "reward" },
  { from: "pretrain", to: "icl" },
  { from: "icl", to: "prompt" },
  { from: "prompt", to: "cot" },
  { from: "prompt", to: "rag" },
  { from: "finetune", to: "lora" },
  { from: "lora", to: "distill" },
  { from: "pretrain", to: "quant" },
  { from: "quant", to: "distill" },
  { from: "transformer", to: "moe" },
  { from: "pretrain", to: "moe" },
  { from: "transformer", to: "multimodal" },
  { from: "multimodal", to: "vlm" },
  { from: "cnn", to: "vlm" },
  { from: "align", to: "constai" },
  { from: "instruct", to: "tooluse" },
  { from: "cot", to: "tooluse" },

  // Systems
  { from: "numer", to: "cuda" },
  { from: "cuda", to: "gpu" },
  { from: "gpu", to: "tpu" },
  { from: "gpu", to: "disttrain" },
  { from: "disttrain", to: "dataparallel" },
  { from: "disttrain", to: "modelparallel" },
  { from: "modelparallel", to: "pipeline" },
  { from: "dataparallel", to: "pipeline" },
  { from: "modelparallel", to: "vram" },
  { from: "transformer", to: "kvcache" },
  { from: "kvcache", to: "attnopt" },
  { from: "attnopt", to: "flashattn" },
  { from: "kvcache", to: "serving" },
  { from: "serving", to: "batching" },
  { from: "quant", to: "quantinf" },
  { from: "quantinf", to: "infeng" },
  { from: "batching", to: "infeng" },
  { from: "embed", to: "vectordb" },
  { from: "rag", to: "vectordb" },
  { from: "vram", to: "flashattn" },

  // Alignment
  { from: "rlhf", to: "reward" },
  { from: "reward", to: "humanfb" },
  { from: "align", to: "redteam" },
  { from: "align", to: "bias" },
  { from: "bias", to: "toxic" },
  { from: "interp", to: "robust" },
  { from: "redteam", to: "robust" },
  { from: "rag", to: "halluc" },
  { from: "robust", to: "halluc" },
  { from: "nn", to: "interp" },
  { from: "constai", to: "redteam" },

  // Applications
  { from: "instruct", to: "chatbot" },
  { from: "tooluse", to: "agents" },
  { from: "cot", to: "agents" },
  { from: "diffusion", to: "imggen" },
  { from: "transformer", to: "codegen" },
  { from: "transformer", to: "summary" },
  { from: "transformer", to: "translate" },
  { from: "embed", to: "search" },
  { from: "vectordb", to: "search" },
  { from: "embed", to: "recsys" },
  { from: "vlm", to: "chatbot" },
  { from: "rag", to: "chatbot" },
  { from: "agents", to: "chatbot" },
];

export interface AtlasGraph {
  clusters: Cluster[];
  nodes: AtlasNode[];
  edges: AtlasEdge[];
}

export const ATLAS_GRAPH: AtlasGraph = {
  clusters: CLUSTERS,
  nodes: NODES,
  edges: EDGES,
};
