import { forwardRef, type ButtonHTMLAttributes } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost'; size?: 'sm' | 'md' }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ variant = 'primary', ...rest }, ref) => (
  <button ref={ref} data-variant={variant} {...rest} />
))
