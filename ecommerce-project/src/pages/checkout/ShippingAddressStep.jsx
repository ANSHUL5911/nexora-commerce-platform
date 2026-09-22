import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '../../components/ui/Icon.jsx';
import { springs, useReducedMotion, withReducedMotion } from '../../lib/motion.js';

export function ShippingAddressStep({
    address,
    onSaveAddress,
    isCompleted,
    isActive,
    onEdit,
}) {
    const shouldReduceMotion = useReducedMotion();
    const [formData, setFormData] = useState({
        fullName: address?.fullName || '',
        addressLine1: address?.addressLine1 || '',
        city: address?.city || '',
        state: address?.state || '',
        pincode: address?.pincode || '',
        phone: address?.phone || '',
    });

    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});

    const validateField = (name, value) => {
        const val = (value || '').trim();
        switch (name) {
            case 'fullName':
                if (!val) return 'Full name is required';
                if (val.length < 2) return 'Full name must be at least 2 characters';
                return '';
            case 'addressLine1':
                if (!val) return 'Street address is required';
                return '';
            case 'city':
                if (!val) return 'City is required';
                return '';
            case 'state':
                if (!val) return 'State is required';
                return '';
            case 'pincode':
                if (!val) return 'PIN code is required';
                if (!/^\d{6}$/.test(val)) return 'Enter a valid 6-digit PIN code';
                return '';
            case 'phone': {
                const digits = val.replace(/\D/g, '');
                if (!digits) return 'Phone number is required';
                if (digits.length !== 10) return 'Enter a valid 10-digit phone number';
                return '';
            }
            default:
                return '';
        }
    };

    const validateAll = () => {
        const newErrors = {};
        Object.keys(formData).forEach((field) => {
            const err = validateField(field, formData[field]);
            if (err) newErrors[field] = err;
        });
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
        if (touched[name]) {
            const err = validateField(name, value);
            setErrors((prev) => ({ ...prev, [name]: err }));
        }
    };

    const handleBlur = (e) => {
        const { name, value } = e.target;
        setTouched((prev) => ({ ...prev, [name]: true }));
        const err = validateField(name, value);
        setErrors((prev) => ({ ...prev, [name]: err }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setTouched({
            fullName: true,
            addressLine1: true,
            city: true,
            state: true,
            pincode: true,
            phone: true,
        });

        if (validateAll()) {
            onSaveAddress({
                fullName: formData.fullName.trim(),
                addressLine1: formData.addressLine1.trim(),
                city: formData.city.trim(),
                state: formData.state.trim(),
                pincode: formData.pincode.trim(),
                phone: formData.phone.replace(/\D/g, ''),
            });
        }
    };

    return (
        <section className={`checkout-step ${isActive ? 'is-active' : ''} ${isCompleted ? 'is-completed' : ''}`} aria-labelledby="step-1-heading">
            <div className="step-header">
                <div className="step-badge">
                    {isCompleted && !isActive ? <Icon name="Check" size={13} strokeWidth={2.5} aria-hidden="true" /> : '1'}
                </div>
                <h2 id="step-1-heading" className="step-title">Delivery Address</h2>
                {isCompleted && !isActive && (
                    <button
                        type="button"
                        className="step-edit-button"
                        onClick={onEdit}
                        aria-label="Edit Delivery Address"
                    >
                        Edit
                    </button>
                )}
            </div>

            <AnimatePresence mode="wait" initial={false}>
                {isActive ? (
                    <motion.div
                        key="address-active-form"
                        initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                        transition={withReducedMotion(springs.accordion, shouldReduceMotion)}
                        style={{ overflow: 'hidden' }}
                    >
                        <form className="step-content address-form" onSubmit={handleSubmit} noValidate>
                    <div className="form-group">
                        <label htmlFor="fullName" className="form-label">
                            Full Name <span className="required-mark" aria-hidden="true">*</span>
                        </label>
                        <input
                            id="fullName"
                            name="fullName"
                            type="text"
                            autoComplete="name"
                            placeholder="e.g. Alex Morgan"
                            value={formData.fullName}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            className={`form-input ${errors.fullName ? 'has-error' : ''}`}
                            aria-invalid={!!errors.fullName}
                            aria-describedby={errors.fullName ? 'fullName-error' : undefined}
                            required
                        />
                        {errors.fullName && (
                            <span id="fullName-error" className="field-error-message" role="alert">
                                {errors.fullName}
                            </span>
                        )}
                    </div>

                    <div className="form-group">
                        <label htmlFor="addressLine1" className="form-label">
                            Street Address <span className="required-mark" aria-hidden="true">*</span>
                        </label>
                        <input
                            id="addressLine1"
                            name="addressLine1"
                            type="text"
                            autoComplete="street-address"
                            placeholder="Apartment, suite, unit, building, floor, etc."
                            value={formData.addressLine1}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            className={`form-input ${errors.addressLine1 ? 'has-error' : ''}`}
                            aria-invalid={!!errors.addressLine1}
                            aria-describedby={errors.addressLine1 ? 'addressLine1-error' : undefined}
                            required
                        />
                        {errors.addressLine1 && (
                            <span id="addressLine1-error" className="field-error-message" role="alert">
                                {errors.addressLine1}
                            </span>
                        )}
                    </div>

                    <div className="form-grid-2">
                        <div className="form-group">
                            <label htmlFor="city" className="form-label">
                                City <span className="required-mark" aria-hidden="true">*</span>
                            </label>
                            <input
                                id="city"
                                name="city"
                                type="text"
                                autoComplete="address-level2"
                                placeholder="e.g. Bengaluru"
                                value={formData.city}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                className={`form-input ${errors.city ? 'has-error' : ''}`}
                                aria-invalid={!!errors.city}
                                aria-describedby={errors.city ? 'city-error' : undefined}
                                required
                            />
                            {errors.city && (
                                <span id="city-error" className="field-error-message" role="alert">
                                    {errors.city}
                                </span>
                            )}
                        </div>

                        <div className="form-group">
                            <label htmlFor="state" className="form-label">
                                State <span className="required-mark" aria-hidden="true">*</span>
                            </label>
                            <input
                                id="state"
                                name="state"
                                type="text"
                                autoComplete="address-level1"
                                placeholder="e.g. Karnataka"
                                value={formData.state}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                className={`form-input ${errors.state ? 'has-error' : ''}`}
                                aria-invalid={!!errors.state}
                                aria-describedby={errors.state ? 'state-error' : undefined}
                                required
                            />
                            {errors.state && (
                                <span id="state-error" className="field-error-message" role="alert">
                                    {errors.state}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="form-grid-2">
                        <div className="form-group">
                            <label htmlFor="pincode" className="form-label">
                                PIN Code <span className="required-mark" aria-hidden="true">*</span>
                            </label>
                            <input
                                id="pincode"
                                name="pincode"
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                autoComplete="postal-code"
                                placeholder="6-digit PIN code"
                                value={formData.pincode}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                className={`form-input ${errors.pincode ? 'has-error' : ''}`}
                                aria-invalid={!!errors.pincode}
                                aria-describedby={errors.pincode ? 'pincode-error' : undefined}
                                required
                            />
                            {errors.pincode && (
                                <span id="pincode-error" className="field-error-message" role="alert">
                                    {errors.pincode}
                                </span>
                            )}
                        </div>

                        <div className="form-group">
                            <label htmlFor="phone" className="form-label">
                                Phone Number <span className="required-mark" aria-hidden="true">*</span>
                            </label>
                            <input
                                id="phone"
                                name="phone"
                                type="tel"
                                inputMode="tel"
                                maxLength={10}
                                autoComplete="tel"
                                placeholder="10-digit mobile number"
                                value={formData.phone}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                className={`form-input ${errors.phone ? 'has-error' : ''}`}
                                aria-invalid={!!errors.phone}
                                aria-describedby={errors.phone ? 'phone-error' : undefined}
                                required
                            />
                            {errors.phone && (
                                <span id="phone-error" className="field-error-message" role="alert">
                                    {errors.phone}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="step-actions">
                        <button type="submit" className="button-primary submit-address-btn">
                            Commit Shipping Coordinates
                        </button>
                    </div>
                </form>
            </motion.div>
            ) : isCompleted ? (
                <motion.div
                    key="address-completed-summary"
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={shouldReduceMotion ? false : { opacity: 0 }}
                    transition={withReducedMotion(springs.responsive, shouldReduceMotion)}
                    className="step-summary-content"
                >
                    <p className="summary-name">{address.fullName}</p>
                    <p className="summary-line">{address.addressLine1}</p>
                    <p className="summary-line">{address.city}, {address.state} — {address.pincode}</p>
                    <p className="summary-phone">Phone: +91 {address.phone}</p>
                </motion.div>
            ) : null}
            </AnimatePresence>
        </section>
    );
}
