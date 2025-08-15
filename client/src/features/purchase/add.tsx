'use client'

import { z } from 'zod'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import { useDispatch, useSelector } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import toast from 'react-hot-toast'
import { Header } from '@/components/layout/header'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Main } from '@/components/layout/main'
import SuppliersProvider from './context/users-context'
import Select from 'react-select'
import { useEffect, useState } from 'react'
import { IconBackspace } from '@tabler/icons-react'
import { addPurchase, fetchPurchaseById, updatePurchase } from '@/stores/purchase.slice'
import { useNavigate } from '@tanstack/react-router'
import { jsPDF } from 'jspdf'; // Import jsPDF
import { useLocation } from '@tanstack/react-router'

// Define the schema for validation
const itemSchema = z.object({
    product: z.string().min(1, { message: 'Product is required' }),
    quantity: z.number().positive({ message: 'Quantity must be greater than 0' }),
    priceAtPurchase: z.number().positive({ message: 'Price must be greater than 0' }),
    total: z.number().positive({ message: 'Total must be greater than 0' }),
});

export const purchaseFormSchema = z.object({
    supplier: z.string().min(1, { message: 'Supplier is required' }),
    items: z.array(itemSchema).min(1, { message: 'At least one item is required' }),
    purchaseDate: z.date().optional(),
    totalAmount: z.number().positive({ message: 'Total amount is required' }),
});

export type PurchaseForm = z.infer<typeof purchaseFormSchema>;

const defaultValues: z.infer<typeof purchaseFormSchema> = {
    supplier: '',
    purchaseDate: new Date(),
    items: [
        {
            product: '',
            quantity: 1,
            priceAtPurchase: 0,
            total: 0,
        },
    ],
    totalAmount: 0,
};

// Define the props for the SuppliersActionDialog

export default function SuppliersActionDialog() {
    const location = useLocation();
    const urlParams = new URLSearchParams(location.search);
    const id = urlParams.get('id');
    const isEdit = !!id;

    useEffect(() => {
        if (isEdit) {
            const loadData = async () => {
                await dispatch(fetchPurchaseById(id)).then((action) => {
                    form.setValue('supplier', action.payload.supplier?.id)
                    form.setValue('purchaseDate', new Date(action.payload.purchaseDate))
                    form.setValue('totalAmount', action.payload.totalAmount)
                    const filteredValues = action.payload.items?.map((item: any) => {
                        return { ...item, product: item?.product?.id };
                    })
                    form.setValue('items', filteredValues)
                })
            }
            loadData()
        }
    }, [id])

    const form = useForm<PurchaseForm>({
        resolver: zodResolver(purchaseFormSchema),
        defaultValues,
    });
    const productsOptions = useSelector((state: any) => state.product?.products);
    const suppliersOptions = useSelector((state: any) => state.supplier?.data);
    const [totalInvoice, setTotallInvoice] = useState(0)

    // console.log("productsOptions", productsOptions)

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'items',
    });

    const dispatch = useDispatch<AppDispatch>();
    const navigate = useNavigate();


    const onSubmit = async (values: PurchaseForm) => {
        if (isEdit) {
            await dispatch(updatePurchase({ ...values, id: id })).then((action) => {
                if (action.payload?.id) {
                    toast.success('Purchase updated successfully');
                    navigate({ to: '/purchase', replace: true })
                    form.reset();
                }
            });
        } else {
            await dispatch(addPurchase(values)).then((action) => {
                if(action.payload.id){
                    toast.success('Purchase created successfully');
                    form.reset();
                }
            });
        }
    };

    // Function to generate PDF
    const generatePDF = (invoiceData: PurchaseForm) => {
        const doc = new jsPDF();

        const getSupplier = suppliersOptions?.find((supplier: any) => supplier.id === invoiceData.supplier);

        // Add title with large font size and center it
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('Purchase Invoice', 105, 20, { align: 'center' });

        // Add supplier and purchase date with spacing
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text(`Supplier: ${getSupplier?.name}`, 20, 30);
        doc.text(`Purchase Date: ${invoiceData?.purchaseDate?.toLocaleDateString()}`, 20, 40);

        // Add a horizontal line for separation
        doc.setLineWidth(0.5);
        doc.line(20, 45, 190, 45); // Draw a line under the header

        // Table Header (bold and center aligned)
        doc.setFont('helvetica', 'bold');
        doc.text('Product', 20, 51);
        doc.text('Quantity', 100, 51);
        doc.text('Price', 140, 51);
        doc.text('Total', 180, 51);

        // Table Row Separator Line
        doc.setLineWidth(0.5);
        doc.line(20, 54, 190, 54);

        // Add items with borders and better formatting
        let y = 60;
        doc.setFont('helvetica', 'normal');
        invoiceData.items.forEach((item) => {
            const product = productsOptions?.find((product: any) => product.id === item.product);

            // Product, Quantity, Price, and Total (aligned properly)
            doc.text(product?.name || '', 20, y);
            doc.text(item.quantity.toString(), 100, y, { align: 'center' });
            doc.text(item.priceAtPurchase.toFixed(2), 140, y, { align: 'right' });
            doc.text(item.total.toFixed(2), 180, y, { align: 'right' });

            // Item Row Border
            doc.setLineWidth(0.2);
            doc.line(20, y + 2, 190, y + 2);

            y += 10;
        });

        // Add a horizontal line after the last row
        doc.setLineWidth(0.5);
        doc.line(20, y + 2, 190, y + 2);

        // Add total amount with a larger font size
        doc.setFontSize(14);
        doc.text(`Total Amount: ${invoiceData.totalAmount.toFixed(2)}`, 20, y + 15);

        // Add footer (optional)
        doc.setFontSize(10);
        doc.setFont('helvetica', 'italic');
        doc.text('Thank you for your business!', 105, y + 25, { align: 'center' });

        // Save PDF with a unique name
        doc.save('purchase_invoice.pdf');
    };


    const watchedItems = useWatch({ control: form.control, name: 'items' }) || [];

    useEffect(() => {
        let total = 0;
        for (let i = 0; i < watchedItems.length; i++) {
            total += Number(watchedItems[i].total) || 0; // Avoid NaN in case of invalid total
        }
        form.setValue('totalAmount', total);
        setTotallInvoice(total)
    }, [watchedItems]);


    return (
        <SuppliersProvider>
            <Header fixed>
                <Search />
                <div className="ml-auto flex items-center space-x-4">
                    <ThemeSwitch />
                    <ProfileDropdown />
                </div>
            </Header>
            <Main>
                <div className="mb-2 flex flex-wrap items-center justify-between space-y-2">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">{isEdit ? 'Edit Purchase' : 'Add New Purchase'}</h2>
                        <p className="text-muted-foreground">
                            {isEdit ? 'Update the Purchase here.' : 'Create new Purchase here.'}
                            Click save when you're done.
                        </p>
                    </div>
                </div>
                <div className="-mr-4 overflow-y-auto min-h-[50vh] py-1 pr-4">
                    <Form {...form}>
                        <form
                            id="supplier-form"
                            onSubmit={form.handleSubmit(onSubmit)}
                            className="space-y-4 p-0.5"
                        >
                            <div className="w-full">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 z-10">
                                    <FormField
                                        control={form.control}
                                        name="supplier"
                                        render={() => (
                                            <FormItem className="space-y-0">
                                                <FormLabel className="col-span-2 text-right">Supplier Name</FormLabel>
                                                <FormControl>
                                                    <Controller
                                                        name="supplier"
                                                        control={form.control}
                                                        render={({ field }) => (
                                                            <Select
                                                                {...field}
                                                                placeholder="Select Supplier..."
                                                                options={suppliersOptions}
                                                                value={suppliersOptions?.find((o: any) => o?.value === field?.value)} // Ensure value is correctly set
                                                                onChange={(option) => {
                                                                    // console.log("option", option)
                                                                    field.onChange(option?.value); // Ensure we are passing the correct value
                                                                }}
                                                                styles={{
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
                                                                    }),
                                                                    singleValue: (base: any) => ({
                                                                        ...base,
                                                                        maxWidth: 'full',
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis',
                                                                        whiteSpace: 'nowrap',
                                                                        color: document.documentElement.classList.contains('dark')
                                                                            ? 'white'
                                                                            : 'black',
                                                                    }),
                                                                    option: (base: any, state: any) => {
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
                                                                                : (isDark ? 'white' : 'black'),
                                                                            cursor: 'pointer',
                                                                        };
                                                                    },
                                                                    menu: (base: any) => ({
                                                                        ...base,
                                                                        backgroundColor: document.documentElement.classList.contains('dark')
                                                                            ? '#1f2937'
                                                                            : 'white',
                                                                        zIndex: 20,
                                                                    }),
                                                                }}
                                                                className="col-span-4 text-sm outline-none border-1 rounded-md focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px] bg-transparent text-black dark:text-white"
                                                            />
                                                        )}
                                                    />
                                                </FormControl>
                                                <FormMessage className="col-span-4 col-start-3" />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="purchaseDate"
                                        render={() => (
                                            <FormItem className="space-y-0">
                                                <FormLabel className="col-span-2 text-right">Date</FormLabel>
                                                <FormControl>
                                                    <Controller
                                                        name="purchaseDate"
                                                        control={form.control}
                                                        render={({ field }) => (
                                                            <input
                                                                type="date"
                                                                value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                                                                onChange={(e) => field.onChange(new Date(e.target.value))}
                                                                className="col-span-4 text-sm outline-none border-1 rounded-md focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px] bg-transparent text-black dark:text-white p-2"
                                                                autoComplete="off"
                                                            />
                                                        )}
                                                    />
                                                </FormControl>
                                                <FormMessage className="col-span-4 col-start-3" />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div className="flex justify-between mt-4">
                                    <h3 className="text-lg font-semibold">Items</h3>
                                    <Button
                                        type="button"
                                        onClick={() => append({ product: '', quantity: 1, priceAtPurchase: 0, total: 0 })}
                                    >
                                        Add Item
                                    </Button>
                                </div>
                                <div className="my-6 space-y-2">
                                    {fields.map((item, index) => (
                                        <div key={item.id} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center">
                                            <Controller
                                                name={`items.${index}.product`}
                                                control={form.control}
                                                render={({ field }) => (
                                                    <Select
                                                        {...field}
                                                        options={productsOptions}
                                                        placeholder="Select Product"
                                                        value={productsOptions.find((opt: any) => opt?.value === field?.value)}
                                                        onChange={(option) => {
                                                            form.setValue(`items.${index}.priceAtPurchase`, option?.cost);
                                                            form.setValue(`items.${index}.total`, option?.cost * form.getValues(`items.${index}.quantity`));
                                                            field.onChange(option?.value)
                                                        }}
                                                        styles={{
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
                                                            }),
                                                            singleValue: (base: any) => ({
                                                                ...base,
                                                                maxWidth: 'full',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap',
                                                                color: document.documentElement.classList.contains('dark')
                                                                    ? 'white'
                                                                    : 'black',
                                                            }),
                                                            option: (base: any, state: any) => {
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
                                                                        : (isDark ? 'white' : 'black'),
                                                                    cursor: 'pointer',
                                                                    zIndex: 9999,
                                                                };
                                                            },
                                                            menu: (base: any) => ({
                                                                ...base,
                                                                backgroundColor: document.documentElement.classList.contains('dark')
                                                                    ? '#1f2937'
                                                                    : 'white',
                                                                zIndex: 9999,
                                                            }),
                                                        }}
                                                        className="min-w-[250px] text-sm outline-none border-1 rounded-md focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px] bg-transparent text-black dark:text-white"
                                                    />
                                                )}
                                            />
                                            <input
                                                type="number"
                                                placeholder="Quantity"
                                                {...form.register(`items.${index}.quantity`, {
                                                    valueAsNumber: true,
                                                    onChange: (e) => {
                                                        const value = e.target.value;
                                                        const quantity = parseFloat(value) || 0;
                                                        form.setValue(`items.${index}.quantity`, quantity);
                                                        const priceAtPurchase = form.getValues(`items.${index}.priceAtPurchase`);
                                                        const total = quantity * priceAtPurchase;
                                                        form.setValue(`items.${index}.total`, total);
                                                    },
                                                })}
                                                className="sm:max-w-[200px] col-span-1 p-2 border rounded-md"
                                            />
                                            <input
                                                type="number"
                                                placeholder="Price"
                                                {...form.register(`items.${index}.priceAtPurchase`, {
                                                    valueAsNumber: true,
                                                    onChange: (e) => {
                                                        const value = e.target.value;
                                                        const priceAtPurchase = parseFloat(value) || 0;
                                                        form.setValue(`items.${index}.priceAtPurchase`, priceAtPurchase);
                                                        const quantity = form.getValues(`items.${index}.quantity`);
                                                        const total = priceAtPurchase * quantity;
                                                        form.setValue(`items.${index}.total`, total);
                                                    },
                                                })}
                                                className="sm:max-w-[200px] col-span-1 p-2 border rounded-md"
                                            />
                                            <input
                                                type="number"
                                                disabled
                                                value={form.getValues(`items.${index}.total`) || 0}
                                                className="sm:max-w-[200px] col-span-1 p-2 border rounded-md text-gray-600"
                                            />
                                            <Button
                                                type="button"
                                                variant="destructive"
                                                className="w-fit"
                                                onClick={() => remove(index)}
                                            >
                                                <IconBackspace stroke={2} className="size-6" />
                                            </Button>
                                        </div>
                                    ))}
                                    {/* <Button
                                        type="button"
                                        onClick={() => append({ product: '', quantity: 1, priceAtPurchase: 0, total: 0 })}
                                    >
                                        Add Item
                                    </Button> */}
                                </div>

                                <div className='grid grid-cols-1 sm:grid-cols-3 my-5 gap-4'>
                                    <div className="mt-4">
                                        <label className="font-medium text-sm">Total Amount</label>
                                        <input
                                            type="number"
                                            disabled
                                            value={totalInvoice}
                                            className="w-full mt-1 p-2 border rounded-md text-gray-700"
                                        />
                                    </div>
                                    <div className="mt-4">
                                        <label className="font-medium text-sm">Previous Balance</label>
                                        <input
                                            type="number"
                                            disabled
                                            value={totalInvoice}
                                            className="w-full mt-1 p-2 border rounded-md text-gray-700"
                                        />
                                    </div>
                                    <div className="mt-4">
                                        <label className="font-medium text-sm">Net Amount</label>
                                        <input
                                            type="number"
                                            disabled
                                            value={totalInvoice}
                                            className="w-full mt-1 p-2 border rounded-md text-gray-700"
                                        />
                                    </div>
                                </div>
                            </div>
                        </form>
                    </Form>
                </div>
                <div className='flex gap-4'>
                    <Button type="submit" form="supplier-form">
                        Save changes
                    </Button>
                    {/* {pdfReady && ( */}
                    <Button
                        type="button"
                        onClick={() => generatePDF(form.getValues())}  // Pass the current form data to generate PDF
                    >
                        Download PDF
                    </Button>
                    {/* )} */}
                </div>
            </Main>
        </SuppliersProvider>
    );
}
