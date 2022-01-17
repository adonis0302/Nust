import { existsSync } from 'fs'
import { defineNuxtModule, addTemplate, addPlugin, templateUtils, addVitePlugin, addWebpackPlugin } from '@nuxt/kit'
import { resolve } from 'pathe'
import { distDir } from '../dirs'
import { resolveLayouts, resolvePagesRoutes, normalizeRoutes } from './utils'
import { TransformMacroPlugin, TransformMacroPluginOptions } from './macros'

export default defineNuxtModule({
  meta: {
    name: 'router'
  },
  setup (_options, nuxt) {
    const pagesDir = resolve(nuxt.options.srcDir, nuxt.options.dir.pages)
    const runtimeDir = resolve(distDir, 'pages/runtime')

    // Disable module if pages dir do not exists
    if (!existsSync(pagesDir)) {
      return
    }

    // Add $router types
    nuxt.hook('prepare:types', ({ references }) => {
      references.push({ types: 'vue-router' })
    })

    // Regenerate templates when adding or removing pages
    nuxt.hook('builder:watch', async (event, path) => {
      const pathPattern = new RegExp(`^(${nuxt.options.dir.pages}|${nuxt.options.dir.layouts})/`)
      if (event !== 'change' && path.match(pathPattern)) {
        await nuxt.callHook('builder:generateApp')
      }
    })

    nuxt.hook('app:resolve', (app) => {
      // Add default layout for pages
      if (app.mainComponent.includes('nuxt-welcome')) {
        app.mainComponent = resolve(runtimeDir, 'app.vue')
      }
    })

    nuxt.hook('autoImports:extend', (autoImports) => {
      const composablesFile = resolve(runtimeDir, 'composables')
      autoImports.push({ name: 'useRouter', as: 'useRouter', from: composablesFile })
      autoImports.push({ name: 'useRoute', as: 'useRoute', from: composablesFile })
      autoImports.push({ name: 'definePageMeta', as: 'definePageMeta', from: composablesFile })
    })

    // Extract macros from pages
    const macroOptions: TransformMacroPluginOptions = {
      macros: {
        definePageMeta: 'meta'
      }
    }
    addVitePlugin(TransformMacroPlugin.vite(macroOptions))
    addWebpackPlugin(TransformMacroPlugin.webpack(macroOptions))

    // Add router plugin
    addPlugin(resolve(runtimeDir, 'router'))

    // Add routes template
    addTemplate({
      filename: 'routes.mjs',
      async getContents () {
        const pages = await resolvePagesRoutes(nuxt)
        await nuxt.callHook('pages:extend', pages)
        const { routes: serializedRoutes, imports } = normalizeRoutes(pages)
        return [...imports, `export default ${templateUtils.serialize(serializedRoutes)}`].join('\n')
      }
    })

    // Add layouts template
    addTemplate({
      filename: 'layouts.mjs',
      async getContents () {
        const layouts = await resolveLayouts(nuxt)
        const layoutsObject = Object.fromEntries(layouts.map(({ name, file }) => {
          return [name, `{defineAsyncComponent({ suspensible: false, loader: () => import('${file}') })}`]
        }))
        return [
          'import { defineAsyncComponent } from \'vue\'',
          `export default ${templateUtils.serialize(layoutsObject)}`
        ].join('\n')
      }
    })
  }
})
