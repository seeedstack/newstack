import type { SVGProps } from 'react'

type IconProps = Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'fill' | 'stroke'> & { size?: number }

function base({ size = 18, ...props }: IconProps, d: string) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d={d} />
    </svg>
  )
}

export const IconArrowLeft = (p: IconProps) => base(p, 'm12 19-7-7 7-7M19 12H5')
export const IconHome = (p: IconProps) => base(p, 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z')
export const IconGrid = (p: IconProps) => base(p, 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z')
export const IconBookmark = (p: IconProps) => base(p, 'm19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z')
export const IconAlert = (p: IconProps) => base(p, 'M12 8v4M12 16h.01M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20')
export const IconSun = (p: IconProps) => base(p, 'M12 17a5 5 0 1 0 0-10 5 5 0 1 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42')
export const IconCloud = (p: IconProps) => base(p, 'M17.5 19H6a4 4 0 1 1 .62-7.95 5 5 0 0 1 9.75 1.46A3.5 3.5 0 0 1 17.5 19z')
export const IconRain = (p: IconProps) => base(p, 'M16 13a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.5 1.5A4 4 0 0 0 6 14h10zM8 17v3M12 17v3M16 17v3')
export const IconSnow = (p: IconProps) => base(p, 'M16 13a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.5 1.5A4 4 0 0 0 6 14h10zM8 18h.01M12 18h.01M16 18h.01')
export const IconStorm = (p: IconProps) => base(p, 'M16 11a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.5 1.5A4 4 0 0 0 6 12h5M13 13l-3 5h3l-2 4')
export const IconList = (p: IconProps) => base(p, 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01')
