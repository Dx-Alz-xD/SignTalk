import { cn } from '@/lib/utils'

// The 21-point hand topology a landmark model actually emits, laid out as an
// open hand. Honest to the product, unlike printing Latin letters.
const points: [number, number][] = [
  [120, 240], // 0 wrist
  [88, 216], [64, 192], [47, 170], [32, 149], // thumb
  [98, 158], [92, 121], [88, 97], [85, 74], // index
  [120, 152], [120, 111], [120, 85], [120, 61], // middle
  [142, 156], [146, 117], [148, 93], [150, 71], // ring
  [164, 166], [174, 137], [180, 117], [186, 99], // pinky
]

const bones: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

const tips = [4, 8, 12, 16, 20]
const palm = [0, 5, 9, 13, 17]

/** The chain the travelling highlight runs along. */
const tracePath = `M ${[0, 5, 6, 7, 8].map((i) => points[i].join(' ')).join(' L ')}`

// Static: useId is a hook, and this renders inside a Server Component. The
// graph appears once per page, so a fixed id cannot collide.
const titleId = 'hand-graph-title'

export function HandGraph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 268"
      fill="none"
      className={cn('h-full w-full', className)}
      role="img"
      aria-labelledby={titleId}
    >
      {/* The SVG equivalent of alt text: read out by screen readers and used
          by crawlers that index inline graphics. */}
      <title id={titleId}>
        A hand with the 21 tracking points a sign language recognition model
        detects, connected into a skeleton
      </title>
      <polygon
        points={palm.map((i) => points[i].join(',')).join(' ')}
        fill="currentColor"
        opacity="0.1"
      />

      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4">
        {bones.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            x1={points[a][0]}
            y1={points[a][1]}
            x2={points[b][0]}
            y2={points[b][1]}
          />
        ))}
      </g>

      <path
        d={tracePath}
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="34 400"
        className="animate-sweep"
      />

      {points.map(([x, y], index) => {
        const isTip = tips.includes(index)
        const isWrist = index === 0
        return (
          <g key={index}>
            {isTip && (
              <circle
                cx={x}
                cy={y}
                r="9"
                fill="currentColor"
                className="animate-breathe"
                style={{ animationDelay: `${tips.indexOf(index) * 240}ms` }}
              />
            )}
            <circle
              cx={x}
              cy={y}
              r={isWrist ? 5.5 : isTip ? 4.5 : 3.2}
              fill="currentColor"
              opacity={isTip || isWrist ? 1 : 0.65}
            />
          </g>
        )
      })}
    </svg>
  )
}
