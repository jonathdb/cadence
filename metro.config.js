// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add wasm to asset extensions so expo-sqlite's web worker can resolve it
config.resolver.assetExts = [...(config.resolver.assetExts || []), 'wasm'];

module.exports = config;
