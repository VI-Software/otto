// Public contexts configuration
// Files uploaded to these contexts will be public by default

export const PUBLIC_CONTEXTS = [
    'public',
    'avatars', 
    'thumbnails',
    'assets',
    'static',
    'media'
]

export const isPublicContext = (context) => {
    return PUBLIC_CONTEXTS.includes(context.toLowerCase())
}

export default {
    PUBLIC_CONTEXTS,
    isPublicContext
}
