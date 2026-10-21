Vendored from [huggingface/torchMoji](https://github.com/huggingface/torchMoji)
at commit `9dd01df645dd84b3645633f55067c0bbcac90011`, under the included MIT license.
`emoji_codes.json` comes from the same revision's `data/` directory.

Compatibility changes:

- Scope the tokenizer's case-insensitive regex flags for modern Python.
- Unpack `PackedSequence.data` and `.batch_sizes` explicitly for modern PyTorch.
- Pass sequence lengths as Python lists instead of NumPy arrays.
- Load tensor state dictionaries with `weights_only=True` and `map_location="cpu"`.

The architecture, tokenizer normalization, hard-sigmoid recurrent activation,
attention and pretrained weights are retained. Inference uses evaluation mode.
The published snapshot records the weight revision and runtime package versions.
