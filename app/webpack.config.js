'use strict'

const path = require('path')
const webpack = require('webpack')
const nodeExternals = require('webpack-node-externals')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const envalid = require('envalid')
const { makeValidator } = envalid

const nonEmptyString = makeValidator((input) => {
  if (typeof input === 'string' && input !== '') {
    return input
  }

  throw new Error(`Not a non-empty string: '${input}'`)
})

const stringifyKeys = obj => (sum, key) => Object.assign({}, sum, { [key]: JSON.stringify(obj[key]) })

const PUBLIC_PATH = '/'

module.exports = function (opts) {
  const { platform } = opts
  const IS_BROWSER = platform === 'browser'
  const IS_SERVER = platform === 'node'

  /*
    ENVIRONMENT VARIABLES
  */

  const { str } = envalid
  const env = envalid.cleanEnv(
      process.env,
      Object.assign({
            NODE_ENV: str({
              choices: ['production', 'development'],
              default: 'development',
            }),
            API_BASE_URL: str({ default: 'not provided' }),
            SPA_BASE_URL: nonEmptyString(),
          },
          IS_BROWSER
              ? { STATIC_ROOT: str({ default: 'not provided' })}
              : { INTERNAL_API_BASE_URL: str({ default: 'not provided' }) }
      ),
      { strict: true  }
  )

  /*
    PLUGINS
  */

  const plugins = []

  if (IS_BROWSER) {
    plugins.push(
        new webpack.DefinePlugin({
          'process.env': [
            'NODE_ENV',
            'API_BASE_URL',
            'SPA_BASE_URL',
          ].reduce(stringifyKeys(env), {}),
        }),
        new MiniCssExtractPlugin({
          // Options similar to the same options in webpackOptions.output
          // all options are optional
          filename: '[name].css',
          chunkFilename: '[id].css',
          ignoreOrder: false, // Enable to remove warnings about conflicting order
        }),
        new HtmlWebpackPlugin({
          favicon: './src/assets/favicon.ico',
          filename: '_index.html',
          template: './src/assets/template.html',
          inject: false
        })
    )
  }

  /*
    RULES
  */

  const jsxRule = {
    test: /\.jsx?$/,
    exclude: /node_modules/,
    use: {
      loader: 'babel-loader',
      options: {
        presets: ['@babel/preset-env']
      }
    }
  }

  const cssRule = Object.assign(
      {
        test: /\.css$/,
      },
      IS_BROWSER
          ? {
            use: [
              {
                loader: MiniCssExtractPlugin.loader,
                options: {
                  hmr: process.env.NODE_ENV === 'development',
                },
              },
              'css-loader',
            ],
          }
          : { loader: 'css-loader/locals' }
  )

  const filesRule = {
    test: /\.(png|svg|gif|jpe?g)$/,
    loader: 'file-loader',
    options: {
      emitFile: IS_BROWSER,
      publicPath: PUBLIC_PATH + 'images/',
      outputPath: 'images/',
      name: '[name].[hash:6].[ext]',
    },
  }

  /*
    CONFIG
  */

  const config = {
    mode: process.env.NODE_ENV, // CHANGE
    entry: IS_BROWSER ? './src/client.js' : './src/server.js',
    devtool: env.isDevelopment
        ? 'cheap-module-eval-source-map'
        : 'cheap-module-source-map',
    output: {
      path: IS_BROWSER ? env.STATIC_ROOT : path.resolve(__dirname, 'bin'),
      publicPath: PUBLIC_PATH,
      filename: IS_BROWSER ? '[name].[chunkhash].js' : 'www',
      libraryTarget: IS_BROWSER ? 'var' : 'commonjs2',
    },
    optimization: {
      runtimeChunk: 'single',
      splitChunks: {
        chunks: 'all',
        maxInitialRequests: 4,
        minSize: 0,
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name(module) {
              const packageName = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/)[1];

              // npm package names are URL-safe, but some servers don't like @ symbols
              return `npm.${packageName.replace('@', '')}`;
            },
          },
        },
      },
    },
    target: IS_BROWSER ? 'web' : 'node',
    resolve: {
      alias: {
        FRS: path.resolve(__dirname, './src'),
        react: path.resolve(__dirname, './node_modules', 'react')
      },
      modules: [path.resolve(__dirname, 'src'), 'node_modules'],
    },
    module: {
      rules: [jsxRule, cssRule, filesRule],
    },
    plugins,
  }

  if (IS_SERVER) {
    Object.assign(config, { node: { __dirname: false, __filename: false }, externals: [nodeExternals()] })
  }

  return config
}
