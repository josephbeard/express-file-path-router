const express = require('express')
const fs = require('fs')
const process = require('process')
const read = require('fs-readdir-recursive')

const routesDirectory = `${process.cwd()}/routes/`
const errorMessagePrefix = 'express-file-system-router\x1b[31m ERR! \x1b[0m'

/**
 * @function validateAppOrExit
 * @description Exit the process if the supplied `app` is not an express app.
 */
function validateAppOrExit(app) {
  if (!app || typeof app.use !== 'function') {
    const errorMessage = `${errorMessagePrefix}handleRoutes was not passed a valid Express app object.\n`
    console.error(errorMessage)
    process.exit(1)
  }
}

/**
 * @function isHandlerAnArrayArrayOfFunctions
 * @description Return true if the supplied handler is an array of functions.
 */
function isHandlerAnArrayFunctions(handler) {
  return Array.isArray(handler) && handler.every((val) => typeof val === 'function')
}

/**
 * @function validateMiddlewareOrExit
 * @description Exit the process if the supplied `middleware` lists
 * a filepath that doesn't exist or has a value that isn't a function or
 * array of functions.
 *
 * This security feature ensures that a misformatted filepath or typo'd var name
 * doesn't result in a developer believing authorization middleware is being
 * used when it isn't.
 * */
function validateMiddlewareOrExit(middleware) {
  for (const [filePath, handler] of Object.entries(middleware)) {
    // Exit if the filepath doesn't exist
    if (!fs.existsSync(routesDirectory + filePath)) {
      const errorMessage = [
        '',
        `Unable to resolve path to "${filePath}" in the "routes" directory.\n`,
        'Check the middleware param for typos or extra "/" in.\n',
        'The accepted formats are "some-directory" and "some-directory/file-name.js".\n',
      ].join(errorMessagePrefix)
      console.error(errorMessage)
      process.exit(1)
    }

    // Exit if the handler is not a function or array of functions.
    if (typeof handler !== 'function' && !isHandlerAnArrayFunctions(handler)) {
      const errorMessage = `${errorMessagePrefix}The middleware supplied for "${filePath}" is not a function or array of functions.\n`
      console.error(errorMessage)
      process.exit(1)
    }
  }
}

/**
 * @function customAlphabetizeUnderscoreLast
 * @description Sort strings normally, except underscores are after all other characters.
 *
 * This makes sure that files with params in the name are handled last so naming conflicts
 * are resolved by using the most specific file name first.
 * 
 * For example, if you have the two files "users/photos.js" and "users/_id.js" and make a call to "/users/photos",
 * the handler in the photos file will be called first rather than treating "photos" as a value for "id" first.
 * */
function customAlphabetizeUnderscoreLast(a, b) {
  let i = -1
  let returnVal = 0
  do {
    i += 1
    if (a[i] === '_') {
      returnVal = 1
    } else if (b[i] === '_') {
      returnVal = -1
    } else {
      returnVal = a.charCodeAt(i) - b.charCodeAt(i)
    }
  } while (a[i] === b[i])
  return returnVal
}

/**
 * @function generateRoutePath
 * @description Convert a relative file path to a route path.
 * @param {String} relativeFilePath  A relative file path
 */
function generateRoutePath(relativeFilePath) {
  const unsanitizedRoutePath = relativeFilePath.includes('index.')
    ? `/${relativeFilePath.substring(0, relativeFilePath.length - 9)}` // Map 'some-directory/index.js' to the router path '/some-directory'.
    : `/${relativeFilePath.substring(0, relativeFilePath.length - 3)}` // Map 'some-directory/file-name.js' to the router path '/some-directory/file-name'.

  return unsanitizedRoutePath
    .replace(/\\/g, '/') // In case the server is running Windows: "\" --> "/".
    .replace(/\/_/g, '/:') // Replace "/_" with "/:" for named parameters.
}

/**
 * @function addMiddlewareForRoute
 * @description Add any supplied middleware for the route in the order they are listed.
 * @param {Object} app An express app
 * @param {String} routePath A route path
 * @param {Object} middleware A map of file paths to middleware
 */
function addMiddlewareForRoute({ app, filePath, middleware, routePath }) {
  for (const [middlewarePath, middlewareFunction] of Object.entries(
    middleware
  )) {
    if (filePath.startsWith(middlewarePath)) {
      app.use(routePath, middlewareFunction)
    }
  }
}

/**
 * @function addHandler
 * @description Add a route to the Express app.
 * If the file exports an Express Router, add each layer of its stack to the app
 * as Express normally does.
 * Otherwise, if the file exports an object, treat each key as a method and add
 * the value as the handler for that method.
 */
function addHandler({ app, routePath, filePath }) {
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const routeHandler = require(routesDirectory + filePath)

  if (Object.getPrototypeOf(routeHandler) === express.Router) {
    // Add each layer in the stack to the app.
    for (const layer of routeHandler.stack) {
      const { method } = layer.route.stack[0]
      const handler = layer.route.stack.map(({ handle }) => handle)
      const path = routePath + layer.route.path
      app[method](path, handler)
    }
  } else {
    // Use each method defined in the object.
    for (const method of Object.keys(routeHandler)) {
      const handler = routeHandler[method]
      app[method](routePath, handler)
    }
  }
}

/**
 * @function handleRoutes
 * @description Route requests based on the tree of files in the routes directory.
 *
 * For example: `routes/some-directory/file-name.js` will handle requests
 * to `/some-directory/file-name`.
 *
 * Note: `index` files will be mapped to handle requests matching their
 * directory name, so `routes/some-directory/index.js` will handle requests
 * to `/some-directory`.
 * @param config
 * @param {Object} config.app An Express app object
 * @param {Object} [config.middleware] An optional object defining
 * middleware to use before specific files or directories. Each key should
 * be a relative path in the routes directory. Each value should be a
 * middleware function or an array of middleware functions to use before that path.
 * @example
 * const app = express()
 * handleRoutes({
 *   app,
 *   middleware: {
 *    'some-directory': function(req, res, next) {},
 *    'some-directory/file-name.js': [
 *       function(req, res, next) {},
 *       function(req, res, next) {},
 *     ],
 *   },
 * })
 * */
function handleRoutes({ app, middleware = {} } = {}) {
  // Run security checks.
  validateAppOrExit(app)
  validateMiddlewareOrExit(middleware)

  // Get a list of all JS and TS files in the routes directory.
  const filePaths = read(routesDirectory)
    .filter((filePath) => filePath.endsWith('.js') || filePath.endsWith('.ts'))
    .sort(customAlphabetizeUnderscoreLast)

  // Add the middleware and handler for each file to the Express app.
  for (const filePath of filePaths) {
    const routePath = generateRoutePath(filePath)
    addMiddlewareForRoute({ app, filePath, middleware, routePath })
    addHandler({ app, routePath, filePath })
  }
}

module.exports = handleRoutes
