import * as React from 'react'
import type { SVGProps } from 'react'

const V0 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" />
    <path d="M12 2v20" />
    <path d="M2 7h20" />
    <path d="M12 2l8 5" />
    <path d="M12 2L4 7" />
  </svg>
)

export default V0

