export const selectBoxStyle = {
    control: (base: any) => ({
        ...base,
        boxShadow: 'none',
        borderColor: 'transparent',
        backgroundColor: 'transparent',
        color: document.documentElement.classList.contains('dark')
            ? 'white'
            : 'black',
        '&:hover': { borderColor: 'transparent' },
        minHeight: '2.5rem',
        borderRadius: '0.5rem',
        border: '1px solid #eaeaea',
    }),
    singleValue: (base:any) => ({
        ...base,
        maxWidth: '280px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: document.documentElement.classList.contains('dark')
            ? 'white'
            : 'black',
    }),
    option: (base:any, state:any) => {
        const isDark = document.documentElement.classList.contains('dark');
        return {
            ...base,
            backgroundColor: state.isSelected
                ? isDark
                    ? '#374151' // dark:bg-gray-700
                    : '#262E40'
                : state.isFocused
                    ? isDark
                        ? '#4b5563' // dark:bg-gray-600
                        : '#d2d5db'
                    : 'transparent',
            color: state.isSelected
                ? (isDark ? 'white' : 'white')
                : (isDark ? 'white' : 'black'), // optional fallback
            cursor: 'pointer',
        };
    },
    menu: (base:any) => ({
        ...base,
        backgroundColor: document.documentElement.classList.contains('dark')
            ? '#1f2937'
            : 'white',
        zIndex: 20,
    }),
}