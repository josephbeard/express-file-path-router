# Express File Path Router
Automatically route requests to files in your `routes` directory based on the filepath.

For example, a module with the file path `routes/users/_id.js` would automatically handle requests made to `/users/:id`.

This routing strategy was inspired by front-end frameworks like Nuxt.js and Next.js.

## Index routes
The router will map files named `index` to the root of the directory.

* `routes/index.js` → `/`.
* `routes/users/index.js` → `/users`.

## Dynamic route segments
To match the dynamic segment, you can use underscore syntax in your file or directory names. This allows you to match named parameters.

* `routes/users/_id/purchases.js` → `/users/:id/purchases`

## Installation
Install with `npm install express-file-path-router`.

## Basic usage
Express File Path Router works with no config. For example:

```js
const express = require('express')
const handleRoutes = require('express-file-path-router')

const app = express()

handleRoutes({ app })
```

## Using with middleware
Middleware can be supplied for file or directory paths in the optional `middleware` object. For example:

```js
handleRoutes({
    app,
    middleware: {
        'users': function (req, res, next) {},
        'users/_id': [
            function (req, res, next) {},
            function (req, res, next) {},
        ],
        'users/_id/purchases.js':  function (req, res, next) {},
    }
})
```

Middleware cascades to child file paths and is used in order starting with the least-specific path and ending with the most-specific path. If an array of middleware is supplied, those are used in the order they are listed in the array. In the above example, requests handled by `users/_id/purchases.js` will use the middleware in this order:

1) The middleware for `users`
2) The first middleware in the array for `users/_id`
3) The second middleware in the array for `users/_id`
4) The middleware for `users/_id/purchases.js`

## Files in the routes directory
Files in the routes directory can either export an Express router instance or export named functions for each method the route should handle.

### Exporting Express Router
Typical existing projects define handlers in files that export an Express Router instance (example below). These files will work with Express File Path Router out of the box.

```js
const express = require('express')

const router = express.Router()

router.get('/', function (req, res) {
    res.send('Welcome')
})

router.post('/', function (req, res) {
    res.send('Submission received!')
})

router.delete('/', function (req, res) {
    res.send('Oh no, you deleted me!')
})

module.exports = router
```

### Exporting named functions

For improved code readability, files can instead export a named function for each request method you want to accept. For example:

```js
module.exports = {
    get(req, res) {
        res.send('Welcome')
    },
    post(req, res) {
        res.send('Submission received!')
    },
    delete(res, res) {
        res.send('Oh no, you deleted me!')
    },
}
```

## Windows
Express File Path Router works with Windows. It will map `\` in the file path to `/` in the request path.

## Caveats
* Predefined routes take precedence over dynamic routes. For example: 
    * `routes/users/a.js` - Will match `/users/a`
    * `routes/users/_id.js` - Will match `/users/1`, `/users/abc`, etc, but will only potentially handle `/users/a` after `routes/users/a.js`  does.
